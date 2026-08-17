/**
 * dsh-wallpaper — DSH Web 动态壁纸插件（Host 半）。
 *
 * 媒体库与 HTTP API：
 *   GET  /wallpaper-api/list          列出壁纸库（~/.dsh/wallpapers）
 *   GET  /wallpaper-api/scan-workshop 扫描 Wallpaper Engine 工坊目录
 *   POST /wallpaper-api/upload        上传本地文件（?name=文件名，原始 body）
 *   POST /wallpaper-api/import        导入工坊文件（JSON { dir, file }）
 *   POST /wallpaper-api/delete        删除壁纸（JSON { id }）
 *   GET  /wallpaper-media/<id>        媒体流式输出（支持 Range/206 拖进度）
 *
 * 安全约束：媒体只从壁纸库目录服务（id 白名单校验，防路径穿越）；
 * 工坊导入只允许 WORKSHOP_ROOT 内的文件；上传上限 1GB。
 */
import { createReadStream, createWriteStream, promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'wallpaper'
export const inject = ['webServer']

const WALLPAPER_DIR = path.join(homedir(), '.dsh', 'wallpapers')
// Wallpaper Engine 工坊根目录：默认 D 盘 Steam；其他机器可通过环境变量
// DSH_WALLPAPER_WORKSHOP_ROOT 指定（例如 D:\SteamLibrary\steamapps\workshop\content\431960）。
const WORKSHOP_ROOT = process.env.DSH_WALLPAPER_WORKSHOP_ROOT
  ? path.resolve(process.env.DSH_WALLPAPER_WORKSHOP_ROOT)
  : path.join('D:', 'steam', 'steamapps', 'workshop', 'content', '431960')
const MAX_UPLOAD = 1024 * 1024 * 1024
const MAX_JSON = 1024 * 1024
const CONFIG_PATH = path.join(homedir(), '.dsh', 'wallpaper-config.json')
const DEFAULT_CONFIG = { enabled: true, current: '', shade: 42, glass: 50, fit: 'cover' }

const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const ID_SAFE = /^[^/\\:*?"<>|\u0000-\u001f]{1,150}$/

const kindOf = (ext) => {
  const type = MEDIA_TYPES[ext.toLowerCase()]
  if (type === undefined) return null
  return type.startsWith('video/') ? 'video' : 'image'
}

const sanitizeBase = (raw) => String(raw ?? '')
  .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
  .replace(/^[.\s]+/, '')
  .trim()
  .slice(0, 80) || 'wallpaper'

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

const errText = (err) => String((err && err.message) || err)

const entryInfo = async (fileName) => {
  const ext = path.extname(fileName)
  const kind = kindOf(ext)
  if (kind === null) return null
  const stat = await fsp.stat(path.join(WALLPAPER_DIR, fileName))
  if (!stat.isFile()) return null
  return {
    id: fileName,
    name: fileName.slice(0, -ext.length),
    ext,
    kind,
    size: stat.size,
    mtime: stat.mtimeMs,
  }
}

const listEntries = async () => {
  const names = await fsp.readdir(WALLPAPER_DIR)
  const entries = []
  for (const fileName of names) {
    const info = await entryInfo(fileName).catch(() => null)
    if (info !== null) entries.push(info)
  }
  entries.sort((a, b) => b.mtime - a.mtime)
  return entries
}

const readJsonBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_JSON) {
      reject(new Error('body too large'))
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
    } catch (err) {
      reject(new Error('invalid JSON'))
    }
  })
  req.on('error', reject)
})

/** id → 壁纸库内绝对路径；非法 id 返回 null（防路径穿越）。 */
const resolveMediaId = (id) => {
  if (typeof id !== 'string' || !ID_SAFE.test(id)) return null
  const filePath = path.join(WALLPAPER_DIR, id)
  if (!filePath.startsWith(WALLPAPER_DIR + path.sep)) return null
  return filePath
}

/* ---------- 配置持久化（永久效果） ---------- */

const readConfig = async () => {
  try {
    const raw = JSON.parse(await fsp.readFile(CONFIG_PATH, 'utf8'))
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CONFIG.enabled,
      current: typeof raw.current === 'string' && ID_SAFE.test(raw.current) ? raw.current : '',
      shade: Number.isFinite(raw.shade) ? Math.min(100, Math.max(0, raw.shade)) : DEFAULT_CONFIG.shade,
      glass: Number.isFinite(raw.glass) ? Math.min(100, Math.max(0, raw.glass)) : DEFAULT_CONFIG.glass,
      fit: ['cover', 'contain', 'fill'].includes(raw.fit) ? raw.fit : DEFAULT_CONFIG.fit,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

const writeConfig = async (body) => {
  const next = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : DEFAULT_CONFIG.enabled,
    current: typeof body.current === 'string' && ID_SAFE.test(body.current) ? body.current : '',
    shade: Number.isFinite(body.shade) ? Math.min(100, Math.max(0, body.shade)) : DEFAULT_CONFIG.shade,
    glass: Number.isFinite(body.glass) ? Math.min(100, Math.max(0, body.glass)) : DEFAULT_CONFIG.glass,
    fit: ['cover', 'contain', 'fill'].includes(body.fit) ? body.fit : DEFAULT_CONFIG.fit,
  }
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

const handleGetConfig = async (req, res) => {
  sendJson(res, 200, await readConfig())
}

const handleSetConfig = async (req, res) => {
  const body = await readJsonBody(req)
  try {
    sendJson(res, 200, await writeConfig(body))
  } catch (err) {
    sendJson(res, 500, { error: errText(err) })
  }
}

const serveMedia = async (req, res, id) => {
  const filePath = resolveMediaId(id)
  if (filePath === null) {
    res.writeHead(404)
    res.end()
    return
  }
  let stat
  try {
    stat = await fsp.stat(filePath)
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  if (!stat.isFile()) {
    res.writeHead(404)
    res.end()
    return
  }
  const type = MEDIA_TYPES[path.extname(filePath).toLowerCase()]
  if (type === undefined) {
    res.writeHead(415)
    res.end()
    return
  }
  const total = stat.size
  const rangeHeader = req.headers.range
  const match = typeof rangeHeader === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null
  const base = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  }
  if (match !== null && (match[1] !== '' || match[2] !== '')) {
    let start
    let end
    if (match[1] === '') {
      const suffix = parseInt(match[2], 10)
      start = Math.max(0, total - suffix)
      end = total - 1
    } else {
      start = parseInt(match[1], 10)
      end = match[2] === '' ? total - 1 : Math.min(parseInt(match[2], 10), total - 1)
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    res.writeHead(206, {
      ...base,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
    })
    createReadStream(filePath, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...base, 'Content-Length': String(total) })
  createReadStream(filePath).pipe(res)
}

const handleUpload = (req, res) => {
  let url
  try {
    url = new URL(req.url ?? '/', 'http://x')
  } catch {
    sendJson(res, 400, { error: 'bad url' })
    return
  }
  const rawName = url.searchParams.get('name') ?? 'upload'
  const ext = path.extname(rawName).toLowerCase()
  if (kindOf(ext) === null) {
    sendJson(res, 400, { error: '不支持的格式（支持 mp4/webm/gif/jpg/jpeg/png/webp）' })
    return
  }
  const base = sanitizeBase(path.basename(rawName, ext))
  const tmpPath = path.join(WALLPAPER_DIR, `.upload-${randomBytes(8).toString('hex')}.part`)
  const out = createWriteStream(tmpPath)
  let size = 0
  let settled = false
  const fail = (status, message) => {
    if (settled) return
    settled = true
    out.destroy()
    fsp.unlink(tmpPath).catch(() => {})
    sendJson(res, status, { error: message })
  }
  out.on('error', () => fail(500, '写入失败'))
  req.on('error', () => fail(400, '上传中断'))
  req.on('data', (chunk) => {
    if (settled) return
    size += chunk.length
    if (size > MAX_UPLOAD) fail(413, '文件过大（上限 1GB）')
  })
  out.on('close', async () => {
    if (settled) return
    try {
      let finalName = `${base}${ext}`
      const exists = await fsp.stat(path.join(WALLPAPER_DIR, finalName)).then(() => true).catch(() => false)
      if (exists) finalName = `${base}-${randomBytes(3).toString('hex')}${ext}`
      await fsp.rename(tmpPath, path.join(WALLPAPER_DIR, finalName))
      const info = await entryInfo(finalName)
      settled = true
      sendJson(res, 200, { entry: info })
    } catch (err) {
      settled = true
      fsp.unlink(tmpPath).catch(() => {})
      sendJson(res, 500, { error: errText(err) })
    }
  })
  req.pipe(out)
}

const handleImport = async (req, res) => {
  let body
  try {
    body = await readJsonBody(req)
  } catch (err) {
    sendJson(res, 400, { error: errText(err) })
    return
  }
  const dir = String(body.dir ?? '')
  const file = String(body.file ?? '')
  if (!/^[0-9A-Za-z_\- ]{1,80}$/.test(dir) || !/^[^/\\]{1,150}$/.test(file)) {
    sendJson(res, 400, { error: '非法路径' })
    return
  }
  const src = path.resolve(WORKSHOP_ROOT, dir, file)
  const rootResolved = path.resolve(WORKSHOP_ROOT)
  if (!src.startsWith(rootResolved + path.sep)) {
    sendJson(res, 400, { error: '越界路径' })
    return
  }
  const ext = path.extname(file).toLowerCase()
  if (kindOf(ext) === null) {
    sendJson(res, 400, { error: '不支持的格式' })
    return
  }
  let stat
  try {
    stat = await fsp.stat(src)
  } catch {
    sendJson(res, 404, { error: '源文件不存在' })
    return
  }
  if (!stat.isFile()) {
    sendJson(res, 400, { error: '不是文件' })
    return
  }
  const base = sanitizeBase(path.basename(file, ext))
  let finalName = `${base}${ext}`
  for (let i = 1; i < 50; i += 1) {
    const exists = await fsp.stat(path.join(WALLPAPER_DIR, finalName)).then(() => true).catch(() => false)
    if (!exists) break
    finalName = `${base}-${i}${ext}`
  }
  try {
    await new Promise((resolve, reject) => {
      const input = createReadStream(src)
      const output = createWriteStream(path.join(WALLPAPER_DIR, finalName))
      input.on('error', reject)
      output.on('error', reject)
      output.on('close', resolve)
      input.pipe(output)
    })
    const info = await entryInfo(finalName)
    sendJson(res, 200, { entry: info })
  } catch (err) {
    sendJson(res, 500, { error: errText(err) })
  }
}

const handleDelete = async (req, res) => {
  let body
  try {
    body = await readJsonBody(req)
  } catch (err) {
    sendJson(res, 400, { error: errText(err) })
    return
  }
  const filePath = resolveMediaId(typeof body.id === 'string' ? body.id : '')
  if (filePath === null) {
    sendJson(res, 400, { error: '非法 id' })
    return
  }
  try {
    await fsp.unlink(filePath)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { error: errText(err) })
  }
}

const handleScan = async (req, res) => {
  let subdirs
  try {
    subdirs = await fsp.readdir(WORKSHOP_ROOT, { withFileTypes: true })
  } catch (err) {
    sendJson(res, 500, { error: `工坊目录不可读: ${errText(err)}` })
    return
  }
  const out = []
  for (const d of subdirs) {
    if (!d.isDirectory()) continue
    const dirPath = path.join(WORKSHOP_ROOT, d.name)
    let title = d.name
    try {
      const pj = JSON.parse(await fsp.readFile(path.join(dirPath, 'project.json'), 'utf8'))
      if (pj && typeof pj.title === 'string' && pj.title) title = pj.title
    } catch { /* 无 project.json 时用目录名 */ }
    let files
    try {
      files = await fsp.readdir(dirPath)
    } catch {
      continue
    }
    for (const f of files) {
      const ext = path.extname(f).toLowerCase()
      if (kindOf(ext) === null) continue
      let stat
      try {
        stat = await fsp.stat(path.join(dirPath, f))
      } catch {
        continue
      }
      if (!stat.isFile()) continue
      out.push({ dir: d.name, title, file: f, ext, size: stat.size })
    }
  }
  out.sort((a, b) => b.size - a.size)
  sendJson(res, 200, { items: out })
}

export function apply(ctx) {
  fsp.mkdir(WALLPAPER_DIR, { recursive: true }).catch(() => {})

  const guard = (handler) => (req, res) => {
    handler(req, res).catch((err) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      sendJson(res, 500, { error: errText(err) })
    })
  }

  const disposers = [
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/list', handler: guard(async (req, res) => { sendJson(res, 200, await listEntries()) }) }),
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/scan-workshop', handler: guard(handleScan) }),
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/upload', handler: handleUpload }),
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/import', handler: guard(handleImport) }),
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/delete', handler: guard(handleDelete) }),
    ctx.webServer.register({ kind: 'exact', path: '/wallpaper-api/config', handler: guard(async (req, res) => {
      if (req.method === 'POST' || req.method === 'PUT') {
        await handleSetConfig(req, res)
      } else {
        await handleGetConfig(req, res)
      }
    }) }),
    ctx.webServer.register({
      kind: 'prefix',
      path: '/wallpaper-media',
      handler: (req, res) => {
        let pathname
        try {
          pathname = new URL(req.url ?? '/', 'http://x').pathname
        } catch {
          res.writeHead(400)
          res.end()
          return
        }
        let id
        try {
          id = decodeURIComponent(pathname.slice('/wallpaper-media/'.length))
        } catch {
          res.writeHead(400)
          res.end()
          return
        }
        serveMedia(req, res, id).catch(() => {
          if (!res.headersSent) {
            res.writeHead(500)
            res.end()
          }
        })
      },
    }),
  ]

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  })
}
