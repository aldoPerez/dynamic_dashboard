function ts() { return new Date().toISOString().replace('T',' ').slice(0,19) }
module.exports = {
  info:  m => console.log(`[${ts()}] [INFO ] ${m}`),
  warn:  m => console.warn(`[${ts()}] [WARN ] ${m}`),
  error: m => console.error(`[${ts()}] [ERROR] ${m}`),
  debug: m => { if (process.env.DEBUG) console.log(`[${ts()}] [DEBUG] ${m}`) },
}
