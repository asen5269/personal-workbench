export function registerDownloadJobs(app, { parseMedia, prepareMedia, platformReferer, history }) {
  const jobs = new Map()
  app.post('/api/download-jobs', (req, reply) => {
    const input = String(req.body?.input || '').trim()
    if (!input || input.length > 4000) return reply.code(400).send({ error: '请输入作品链接' })
    if ([...jobs.values()].filter(job => job.status === 'running').length >= 2) return reply.code(429).send({ error: '已有两个下载任务，请稍后再试' })
    const id = crypto.randomUUID(), job = { status: 'running', stage: '解析作品链接', bytes: 0, started: Date.now() }
    jobs.set(id, job)
    ;(async () => {
      try {
        const parsed = await parseMedia(input)
        const quality = req.body.quality === 'original' ? 'original' : 'standard'
        const data = await prepareMedia(parsed, { original: quality === 'original', referer: platformReferer(parsed.platform), onProgress: progress => Object.assign(job, progress) })
        const historyId = history.record(data, data, quality)
        Object.assign(job, { status: 'done', stage: '文件已就绪', result: history.data(historyId) })
      } catch (error) { Object.assign(job, { status: 'failed', stage: '准备失败', error: error.message }) }
      finally { const timer = setTimeout(() => jobs.delete(id), 3600000); timer.unref() }
    })()
    return reply.code(202).send({ id })
  })
  app.get('/api/download-jobs/:id', (req, reply) => jobs.get(req.params.id) || reply.code(404).send({ error: '任务不存在或服务已重启，请重试' }))
}
