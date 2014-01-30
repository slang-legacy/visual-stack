module.exports = function (id,fac){
//PACKSTART
  // | returns path of file
  function path(p){ //
    if(!p) return ''
    p = p.replace(/\.\//g, '')
    var b = p.match(/([\s\S]*)\/[^\/]*$/)
    return b ? b[1] : ''
  }

  // | normalizes relative path r against base b
  function norm(r, b){
    b = b.split(/\//)
    r = r.replace(/\.\.\//g,function(){ b.pop(); return ''}).replace(/\.\//g, '')
    var v = b.join('/')+ '/' + r
    if(v.charAt(0)!='/') v = '/'+v
    return v
  }
  //PACKEND
//PACKSTART
  function def(id, fac){
    if(!fac) fac = id, id = null
    def.factory[id || '_'] = fac
  }

  def.module = {}
  def.factory = {}
  def.urls = {}
  def.tags = {}

  function req(id, base){
    if(!base) base = ''
    if(typeof require !== "undefined" && id.charAt(0) != '.') return require(id)

    id = norm(id, base)

    var c = def.module[id]
    if(c) return c.exports

    var f = def.factory[id]
    if(!f) throw new Error('module not available '+id + ' in base' + base)
    var m = {exports:{}}

    var localreq = def.mkreq(id)

    var ret = f(localreq, m.exports, m)
    if(ret) m.exports = ret
    def.module[id] = m

    return m.exports
  }

  def.mkreq = function(base){
    function localreq(i){
      return def.req(i, path(base))
    }

    localreq.reload = function(i, cb){
      var id = norm(i, base)
      script(id, 'reload', function(){
        delete def.module[id] // cause reexecution of module
        cb( req(i, base) )
      })
    }

    localreq.absolute = function(i){
      return norm(i, path(base))
    }

    return localreq
  }
  def.req = req
  def.outer = define
  if(typeof require !== 'undefined') def.require = require
  def.path = path
  def.norm = norm

  define = def
  def(id, fac)

  //PACKEND
}
