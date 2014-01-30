#!/usr/bin/env node
define = require('./define');
settings = require('./settings');

define('/trace/trace_server', require('./trace/trace_server'));
define('/core/fn', require('./core/fn'));
define('/core/acorn', require('./core/acorn'));
define('/core/acorn_tools', require('./core/acorn_tools'));
define('/core/io_channel', require('./core/io_channel'));
define('/trace/instrument', require('./trace/instrument'));
define('/core/io_server', require('./core/io_server'));
define('/core/gl_browser', require('./core/gl_browser'));
define('/core/gl', require('./core/gl'));
define('/core/ext_lib', require('./core/ext_lib'));
define('/core/ui_draw', require('./core/ui_draw'));
define('/core/ui', require('./core/ui'));
define('/core/controls_mix', require('./core/controls_mix'));
define('/core/controls', require('./core/controls'));
define('/core/themes', require('./core/themes'));
define('/core/text_mix', require('./core/text_mix'));

define('/trace/trace_db',function(require, exports, module){
  var fn = require("../core/fn")
  var ui = require("../core/ui")
  var tm = require("../core/text_mix")

  function traceDb(o){
    // we store the trace list and databases
    var db = {sh:{}}

    // put a textstore on the db object
    tm.storage(db)

    // fire a changed event
    db.changed = fn.ps()

    // file and line dictionaries
    db.lineDict = o?o.lineDict:{} // line dictionary
    db.fileDict = o?o.fileDict:{}
    db.msgIds = {}

    // trace message
    //  i - line index
    //  a - arguments
    //  d - depth
    //  c - call entry ID
    //  r - return message
    //  t - type
    //  s - searchable text
    //  y - y coordinate
    //  b000 - block marker

    // line object
    //   fid - file ID
    //   ret - function return index (for return)
    //   x - x coordinate
    //   y - y coordinate
    //   ex - end x
    //   ey - end y
    //   n - function name
    //   a - argument name array

    // file dictionary
    //  longName
    //  shortName

    var fid = 0 // file id

    // trace colors
    db.colors = {
      def:ui.t.codeName,
      i:ui.t.codeName,
      s:ui.t.codeString,
      a:ui.t.codeOperator,
      n:ui.t.codeNumber,
      v:ui.t.codeVardef,
      t:ui.t.codeName,
      c:ui.t.codeComment,
      1:ui.t.codeColor1,
      2:ui.t.codeColor2,
      3:ui.t.codeColor3,
      4:ui.t.codeColor4,
      5:ui.t.codeColor5,
      6:ui.t.codeColor6,
      7:ui.t.codeColor7,
      8:ui.t.codeColor8
    }

    var last
    var lgc = 0
    db.processTrace = function(m){

      if(!lgc) lgc = m.g
      else{
        if(lgc + 1 != m.g){
          fn("Message order discontinuity", lgc, m.g)
        }
        lgc = m.g
      }

      // look up trace message
      var l = db.lineDict[m.i]
      if(!l){
        fn('got trace without lookup')
        return
      }

      // make callstack parents
      if(!last){
        if(l.n) last = m
      } else {
        if(m.d > last.d) m.p = last, last = m
        else { // depth is equal or less
          if(l.ret){ // we are a return/
            // store us as the return message
            // check if we can be a return from last
            if(l.ret != last.i){
              var l2 = db.lineDict[l.ret]
              var n2 = db.fileDict[l2.fid].longName
              var l3 = db.lineDict[last.i]
              var n3 = db.fileDict[l3.fid].longName
              fn('invalid return',m.i, n2, l2.n, l2.y, n3, l3.n, l3.y)
            }
            last.r = m
            // add return to text search field
            last.s += ' '+db.fmtCall(m).replace(/\f[a-zA-Z0-9]/g,'')
          } else {

            //var l2 = db.lineDict[l.ret]
            var n2 = db.fileDict[l.fid].longName

            var l3 = db.lineDict[last.i]
            var n3 = db.fileDict[l3.fid].longName
            // non return following
            //  fn('missed return from', n3, l3.n,l3.y, 'got', m.i, n2, l.n, l.y)
            fn(m.i, l)
          }
          // if we are not a  return(m.f)
          var d = (last.d - m.d) + 1
          while(d > 0 && last) last = last.p, d--
          if(l.n){
            m.p = last, last = m
          }
        }
      }
      // add our line if  we are a function call
      if(l.n){
        if(last && last.p){ // store our call on
          if(last.p.cs)  m.nc = last.p.cs
          last.p.cs = m
        }
        m.y = db.th
        var dp = m.d > 64 ? 64 : m.d
        db.addTabs(dp, 1, ui.t.codeTab)
        var t = db.fmtCall(m)
        db.addFormat((m.d>dp?'>':'')+t, db.colors)
        db.endLine(m)
        // keep a ref
        if(!db.firstMessage) db.firstMessage = m

        db.msgIds[m.g] = m

        // chain the closures
        var u = db.msgIds[m.u]
        if(u){
          if(u.us) m.nu  = u.us
          u.us = m
        }

        m.s = t.replace(/\f[a-zA-Z0-9]/g,'')

        db.changed()
        return true
      }
    }

    db.find = function(id){
      return db.msgIds[id]
    }

    db.addTrace = function(m){
      db.addFormat(db.fmtCall(m), db.colors)
      db.endLine(m)
    }

    db.fmt  = function(v, lim){
      lim = lim || 255
      var t = typeof v
      if(t == 'string'){
        if(v.indexOf('_$_') == 0){
          v = v.slice(3)
          if(v == 'undefined') return '\fn'+v
          return '\fv' + v
        }
        return '\fs'+JSON.stringify(v)
      }
      if(t == 'number') return '\fn'+v
      if(t == 'boolean') return '\fn'+v
      if(t == 'undefined') return '\fnundefined'
      if(!v) return '\fnnull'
      if(Array.isArray(v)){
        var s = '\fi['
        for(var k in v){
          if(s.length!=3) s+='\fi,'
          s += db.fmt(v[k])
        }
        s += '\fi]'
        if(s.length>lim) return s.slice(0,lim)+' \fv...\fi]'
      } else {
        var s = '\fi{'
        for(var k in v){
          if(s.length!=3) s+='\fi,'
          if(k.indexOf(' ')!=-1) s+='\fs"'+ k+'"'+'\fi:'
          else s += '\ft' + k + ':'
          t = typeof v[k]
          s += db.fmt(v[k])
        }
        s += '\fi}'
        if(s.length>lim) return s.slice(0,lim)+' \fv...\fi}'
      }
      return s
    }

    db.modColor = function(mod){
      var uid = 0
      for(var i = 0;i<mod.length;i++) uid += mod.charCodeAt(i)
      return (uid)%8 + 1
    }

    // returns a formatted function traceline
    db.fmtCall = function(m){
      if(m.x){
        return '\faexception '+(m.v===undefined?'':db.fmt(m.v))
      }
      var l = db.lineDict[m.i]
      var mod = db.fileDict[l.fid].shortName
      var col = db.modColor(mod)

      if(l.ret){ // function return
        var f = db.lineDict[l.ret]
        return '\fareturn '+(m.v===undefined?'':db.fmt(m.v))
      } else {
        var s = []
        for(var i = 0;i<l.a.length;i++) s.push('\ft'+l.a[i].n + '\fa=' + db.fmt(m.a[i]))
        return '\f'+col+mod+ '\fa \fi'+l.n+'\fi('+s.join('\fi,')+'\fi)'
      }
    }

    // adds a dictionary
    db.addDict = function(m){
      var d = m.d
      for(var k in d){
        db.lineDict[k] = d[k]
        db.lineDict[k].fid = fid
      }
      var sn = m.f.match(/[\/\\]([^\/\\]*)(?:.js)$/)
      sn = sn?sn[1]:m.f
      db.fileDict[fid++] = {
        longName:m.f,
        shortName:sn
      }
    }

    return db
  }

  return traceDb
})

// Shader library
define('/core/text_shaders',function(require, exports){
  "no tracegl"
  var gl = require("./gl")
  var ui = require("./ui")

  // code text using POINTS
  exports.codeText = ui.shader({
    u: {
      b:'sampler2D', // font texture
      sz:'vec4', //x:font width, y:font height, z:point size, w:pixel adjustment
      ps:'vec4', //x:text x offset, y:text y offset, z:pixel x offset, w:pixel y offset
    },
    a: {
      e:'ucol', // x:text x coord, y:text y coord, z:font texture x, w:font texture y
      fg:'float' // foreground color
    },
    p: 'sz.z',
    v: gl.ratio>1?
      'vec4((((ps.z+(ps.x+e.x*255)*sz.x+0.25*sz.z)+sz.w+l.x)/s.x)*2.-1.,1.-(((ps.w + (ps.y+e.y*255)*sz.y+0.25*sz.z)+sz.w+l.y)/s.y)*2.,0,1.)':
      'vec4(((floor(ps.z+(ps.x+e.x*255)*sz.x+0.5*sz.z)+sz.w+l.x)/s.x)*2.-1.,1.-((floor(ps.w + (ps.y+e.y*255)*sz.y+0.5*sz.z)+sz.w+l.y)/s.y)*2.,0,1.)',
    f: gl.ratio>1?
      'subpix(texture2D(b,vec2(e.z*0.99609375 + c.x/(512./26.), e.w*0.99609375 + c.y/(512./26.))),t.codeBg,theme(fg))':
      'subpix(texture2D(b,vec2(e.z*0.99609375 + c.x/(512./13.), e.w*0.99609375 + c.y/(128./13.))),t.codeBg,theme(fg))',
    m: ui.gl.POINTS,
    l: 1
  })

  // selection rectangle, flagged round edges
  exports.selectRect = ui.shader({
    u: {
      sz:'vec4', //x:font width, y:font height, z:shift y
      ps:'vec4', //x:text x offset, y:text y offset, z:pixel x offset, w:pixel y offset
      fg:'float' //palette foreground
    },
    a: {
      e:'vec2', //x:text coord x, y:text coord y
      r:'vec4'  //x:left text coord, y:top text coord, z:right text coord, w:flag 1 tl, 2 bl, 4 tr, 8 br
    },
    v: 'vec4((floor(ps.z + (e.x+ps.x)*sz.x+l.x)/s.x)*2.-1., 1.-(floor(ps.w + (e.y+ps.y)*sz.y-sz.z+l.y)/s.y)*2.,0,1.)',
    f: function(){
      vec3_v(floor(ps.z + (ps.x + r.x)* sz.x),floor(ps.w + (ps.y + r.y )* sz.y - sz.z), ps.z + (ps.x + r.z) * sz.x)
      vec4_c(theme(fg))
      if(f.x < v.x + 0.5*sz.x){
        vec2_d(f.x - (v.x + sz.x), f.y - (v.y + 0.5*sz.y))
        if(d.y<0 && mod(r.w,2) == 1) return_vec4(c)
        if(d.y>0 && mod(r.w,4) >= 2) return_vec4(c)
        return_vec4(c.xyz, sqrt(d.x*d.x+d.y*d.y)>9?0:c.w)
      } else if(f.x > v.z - 0.5*sz.x ){
        vec2_d(f.x - (v.z - sz.x), f.y - (v.y + 0.5*sz.y))
        if(d.y<0 && mod(r.w,8) >= 4) return_vec4(c)
        if(d.y>0 && mod(r.w,16) >= 8) return_vec4(c)
        return_vec4(c.xyz, sqrt(d.x*d.x+d.y*d.y)>9?0:c.w)
      }
      return_vec4(c)
    },
    m: ui.gl.TRIANGLES,
    l: 6
  })
})

define('/trace/code_db',function(require){
  var fn = require("../core/fn")
  var ui = require("../core/ui")

  var acorn_tools = require("../core/acorn_tools")

  var ct = require("../core/controls")
  var tm = require("../core/text_mix")
  var ts = require("../core/text_shaders")
  var gl = ui.gl

  //  Styling
  var ft1 = ui.gl.sfont(
    navigator.platform.match(/Mac/)?
    "12px Menlo":
    "12px Lucida Console")

  function codeDb(g){

    var db = {sh:{}}
    db.files = {}

    var ls = 0 // leading spaces
    var lw = 0 // leading width
    function addWhitespace(f, text, fg){
      // process whitespace and comments
      var l = text.length
      var v = f.text.last() || f.addChunk('', c)
      // if n.w contains comments
      for(var i = 0;i < l; i++){

        var c = text.charCodeAt(i)
        if(c == 32){ // space
          // are we crossing a tab boundary?
          if(ls && !(v.x%tabWidth)) v = f.addChunk("\x7f", ctbl.tab)
          else v.x ++
        }
        else if(c == 9){ // tab
          // snap to tab boundary
          var tw = tabWidth - v.x%tabWidth
          // output tabline ad tw
          if(ls && !(v.x%tabWidth)) v = f.addChunk("\x7f", ctbl.tab), v.x += tabWidth - 1
          else v.x += tw
        }
        else if(c == 10){ // newline
          var xold = v.x
          if(v.x < lw){ // output missing tabs
            for(v.x = v.x?tabWidth:0;v.x<lw;v.x += tabWidth - 1)
              v = f.addChunk("\x7f", ctbl.tab)
          }
          f.endLine(xold)
          ls = 1
        } else {
          // output blue comment thing
          if(ls) lw = v.x, ls = 0
          v = f.addChunk(text.charAt(i), fg || ctbl.comment)
        }
      }
    }

    // theme lookup
    var ctbl = {
      "num" : ui.t.codeNumber,
      "regexp": ui.t.codeRegexp,
      "name": ui.t.codeName,
      "string": ui.t.codeString,
      "keyword": ui.t.codeOperator,
      "var": ui.t.codeVardef,
      "tab": ui.t.codeTab,
      "comment": ui.t.codeComment,
      "operator": ui.t.codeOperator
    }

    var tabWidth = 3

    db.fetch = function(name, cb){
      // if we dont have name,
    }

    db.parse = function(name, src){
      var f = db.files[name] || (db.files[name] = {})
      f.file = name
      // create text storage on file object
      tm.storage(f)
      f.font = ft1 // todo centralize font
      f.sh = {text:db.sh.text}
      src = src.replace(/^\#.*?\n/,'\n')
      f.lines = src.replace(/\t/,Array(tabWidth+1).join(' ')).split(/\n/)

      var t = acorn_tools.parse(src)
      t.tokens.walk(function(n){
        if(n.t){
          // colorize token
          var c = ctbl[n._t.type]
          if(!c) {
            if(n._t.binop || n._t.isAssign) c = ctbl.operator
            else if(n._t.keyword){
              if(n.t == 'var' || n.t == 'function') c = ctbl.var
              else c = ctbl.keyword
            } else c = ctbl.name
          }
          // process token
          if(n.t.indexOf('\n')!= -1){
            var a = n.t.split(/\n/)
            for(var i = 0;i<a.length;i++){
              f.addChunk(a[i], c)
              if(i < a.length - 1) f.endLine()
            }
          } else {
            if(ls) lw = f.text.last().x, ls = 0
            f.addChunk(n.t, c)
          }
        }
        addWhitespace(f, n.w)

      })
      //b.size()
      return f
    }
    return db
  }
  return codeDb
})

define('/trace/list_view',function(require, exports, module){
  var fn = require("../core/fn")
  var ui = require("../core/ui")
  var ct = require("../core/controls")
  var tm = require("../core/text_mix")
  var ts = require("../core/text_shaders")
  var gl = ui.gl

  //Styling
  var font1 = ui.gl.sfont(
    navigator.platform.match(/Mac/)?
    "12px Menlo":
    "12px Lucida Console")

  function listView(g){
    var b = ui.rect({f:'t.codeBg'})

    b._v_ = ct.vScrollHider({h:'p.h - 10'})
    b._h_ = ct.hScrollHider({w:'p.w - 10'})

    b.set(g)
    b.font = font1
    //|  rendering

    // shaders+-
    b.sh = {
      lrShadow: ui.rect.drawer({f:'mix(vec4(0,0,0,0.3),vec4(0,0,0,0),c.x)'}), // dropshadow
      topShadow: ui.rect.drawer({f:'mix(vec4(0,0,0,0.3),vec4(0,0,0,0),c.y)'}),
      text:   ui.gl.getShader(ts.codeText), // text
      select: ui.gl.getShader(ts.selectRect), // selection
      cursor: ui.rect.drawer({f:'t.codeCursor'}), // cursor
      line:   ui.rect.drawer({f:'t.codeLine'}), // linemark
      hover:  ui.rect.drawer({f:'t.codeHover'}),
      mark:   ui.rect.drawer({f:'t.codeMark'})
    }
    // mix in behaviors
    tm.viewport(b)
    tm.cursors(b, {singleCursor:1, noSelect:1, cursor:'default'})
    tm.drawing(b)
    tm.storage(b)

    b.vps.gx = 0
    b.vps.gy = 0

    // connect to a db object
    if(b.db){
      b.text = b.db.text
      b.db.font = b.font
      b.db.sh.text = b.sh.text

      var rt = 0
      b.db.changed(function(){
        b.tw = b.db.tw
        b.th = b.db.th
        if(!rt) rt = setTimeout(function(){
          rt = 0
          // if the scrollbars are at 'end' we should keep them at the end
          b.size()
          ui.redraw(b)
        },0)
      })
    }

    // connect cursors
    if(b.cursor){
      b.cursor.linked = b
      b.vcs = b.cursor.vcs
      b.dcs = b.cursor.dcs
      // crosslink the 'view' change event
      b.viewChange = function(x, y){
        //b.cursor.view(x, y, 0, 1)
        fn('here1')
      }
      var last
      b.cursor.viewChange = function(x, y){
        // alright so we have a cursor selection,
        // lets fetch the data stored at our first cursor
        var c = b.dcs.l.first() || b.vcs.l.first()
        //fn(c!=null, c.d!=null, last!=c.d, b.db.selectTrace !=0)
        if(c && c.d && last != c.d && b.db.selectTrace) b.db.selectTrace(last = c.d)
        b.view(x, y, 0, 1)
        if(b.cursorMove)b.cursorMove()
      }
    }

    // if we
    b.o = function(){
      // set the view back to our head cursor
      if(b.linked){
        var c = b.vcs.l.first()
        if(c){
          b.linked.view(0,c.y, 0, 1, 1)
        }
      } else {
        b.hy = -1
        ui.redraw(b)
      }
    }

    b.textHover = function(){
      if(b.linked && b.linked.cursorMove) b.linked.cursorMove()
      ui.redraw(b)
      if(b.linked) ui.redraw(b.linked)
    }

    // rendering
    var ly = 0
    function layer(){

      ui.view(b, b.vps.o)

      if(!b._v_.pg) b.size()

      // draw hover cursor
      var y = b.hy
      if(y >=0) b.sh.hover.rect(b.vps.o.x , b.vps.o.y - b.vps.ss + (y + b.vps.y) * b.vps.sy + b.vps.gy, b.vps.o.w , b.vps.sy )

      if(ly != y){
        ly = y
        if(b.linked){
          b.linked.hy = y
          b.linked.view(0, y, 0, 1, 1)
        }
      }
      // draw selection line
      var c = b.vcs.l.first()
      while(c){
        b.sh.mark.rect(b.vps.o.x , b.vps.o.y - b.vps.ss + (b.vps.y + c.y) * b.vps.sy + b.vps.gy, b.vps.o.w, b.vps.sy)
        c = c._d
      }
      var c = b.dcs.l.first()
      while(c){
        b.sh.mark.rect(b.vps.o.x , b.vps.o.y - b.vps.ss + (b.vps.y + c.y) * b.vps.sy + b.vps.gy, b.vps.o.w, b.vps.sy)
        c = c._d
      }
      b.drawText()

      //ui.clip(b.vps.o.x, b.vps.o.y, b.vps.o.w, b.vps.o.h )
      b.drawShadows()
    }
    b.l = layer

    b.show = function(){
      b.l = layer
      ui.redraw(b)
    }
    b.hide = function(){
      if(b.l !== -1){
        b.l = -1
        ui.redraw(b)
      }
    }
    return b
  }
  return listView
})

define('/trace/code_view',function(require){

  var fn = require("../core/fn")
  var ui = require("../core/ui")

  var ac = require("../core/acorn")

  var ct = require("../core/controls")
  var tm = require("../core/text_mix")
  var ts = require("../core/text_shaders")
  var gl = ui.gl

  // Styling
  var ft1 = ui.gl.sfont(
    navigator.platform.match(/Mac/)?
    "12px Menlo":
    "12px Lucida Console")

  function codeView(g){

    // background
    var b = ui.rect({f:'t.codeBg'})

    // scrollbars
    b._v_ = ct.vScroll({h:'p.h - 10'})
    b._h_ = ct.hScroll({w:'p.w - 10'})

    b.set(g)
    b.font = ft1

    //|  rendering

    // shaders+-
    b.sh = {
      text: ui.gl.getShader(ts.codeText), // text
      select: ui.gl.getShader(ts.selectRect), // selection
      cursor: ui.rect.drawer({f:'t.codeCursor'}), // cursor
      line: ui.rect.drawer({f:'t.codeLineBg'}), // linemark
      lrShadow: ui.rect.drawer({f:'mix(vec4(0,0,0,0.2),vec4(0,0,0,0),c.x)'}), // dropshadow
      topShadow: ui.rect.drawer({f:'mix(t.codeBg,vec4(0,0,0,0),c.y)'})
    }

    // mix in behaviors
    tm.viewport(b)
    tm.cursors(b)
    tm.drawing(b)

    // rendering
    b.l = function(){
      ui.view(b, b.vps.o)

      if(!b._v_.pg) b.size()
      // update line numbers
      b.linesUpdate(ui.t.codeLine)
      b.drawLineMarks()
      b.drawLines()

      ui.clip(b.vps.o.x + b.vps.gx, b.vps.o.y, b.vps.o.w - b.vps.gx, b.vps.o.h)

      // draw if/else markers

      b.drawSelection()
      if(b.text){
        b.drawText()
      }
      b.drawCursors()

      ui.clip(b.vps.o.x, b.vps.o.y, b.vps.o.w, b.vps.o.h)
      b.drawShadows()
    }

    return b
  }

  return codeView
})

define('/trace/hover_text',function(require){

  var fn = require("../core/fn")
  var ui = require("../core/ui")

  var ac = require("../core/acorn")

  var ct = require("../core/controls")
  var tm = require("../core/text_mix")
  var ts = require("../core/text_shaders")
  var gl = ui.gl

  // Styling
  var ft1 = ui.gl.sfont(
    navigator.platform.match(/Mac/)?
    "12px Menlo":
    "12px Lucida Console")

  hoverText.ft = ft1
  function hoverText(g){
    "no tracegl"
    // background
    var b = ui.rect({f:'mix(vec4(0,0,0,0),alpha(t.codeBg2,0.9),1-smoothstep(0.5,1.0,n.shape(2*(c-.5))))'})
    b.shape = function(vec2_v){
      return_float(len(vec2(pow(abs(v.x),n.w/5),pow(abs(v.y),n.h/5))))
    }

    // scrollbars
    //b._v_ = ct.vScroll({h:'p.h - 10'})
    //b._h_ = ct.hScroll({w:'p.w - 10'})

    b.set(g)
    b.font = ft1

    //|  rendering

    // shaders+-

    var ts1 = ts.codeText
  //  ts1.f = 'subpix(texture2D(b,vec2(e.z*0.99609375 + c.x/(512./26.), e.w*0.99609375 + c.y/(128./26.))),t.codeBg,theme(fg))'
//    ts1.f = 'subpix(texture2D(b,vec2(e.z*0.99609375 + c.x/(512./13.), e.w*0.99609375 + c.y/(512./13.))),t.codeBg,theme(fg))'
    //ts1.f = 'subpix(texture2D(b,vec2(0.219 + c.x*0.025390625, 0.191 + c.y*0.025390625)),t.codeBg,theme(fg))'
  //  ts1.f = 'fg*0.001+vec4(c.x, c.y,e.z,1)'//+subpix(texture2D(b,1.-vec2(e.z*0.99609375 + c.x/(512./26.), e.w*0.99609375 + c.y/(256./26.))),t.codeBg,theme(fg))+red'
    //ts1.dbg = 1
    b.sh = {
      text: ui.gl.getShader(ts1), // text
      select: ui.gl.getShader(ts.selectRect), // selection
      cursor: ui.rect.drawer({f:'t.codeCursor'}), // cursor
      line: ui.rect.drawer({f:'t.codeLineBg'}), // linemark
      lrShadow: ui.rect.drawer({f:'mix(vec4(0,0,0,0.2),vec4(0,0,0,0),c.x)'}), // dropshadow
      topShadow: ui.rect.drawer({f:'mix(t.codeBg,vec4(0,0,0,0),c.y)'})
    }

    // mix in behaviors
    tm.viewport(b)
    tm.cursors(b)
    tm.drawing(b)
    tm.storage(b)

    b.vps.gx = 5
    b.vps.gy = 5

    b.fit = function(x, y){
      var w = b.tw * b.vps.sx + 2*b.vps.gx
      x -= 0.5 * w
      if(x + w > ui.gl.width)
        x = fn.max(0, x + (ui.gl.width - (x + w)))
      if(x < 0) x = 0

      b.show(x, y + b.vps.sy, w,
         b.th * b.vps.sy + 1*b.vps.gy
      )
    }

    b.show = function(x, y, w, h){
      b.l = layer
      ui.redraw(b)
      ui.redrawRect(x, y, w, h)
      b.x = x
      b.y = y
      b.w = w
      b.h = h
    }

    b.hide = function(){
      if(b.l !== -1){
        b.l = -1
        ui.redraw(b)
      }
    }

    // rendering
    function layer(){
      ui.view(b, b.vps.o)

      //if(!b._v_.pg) b.size()
      // draw if/else markers

      b.drawSelection()
      if(b.text) b.drawText()
    }
    b.l = layer
    return b
  }

  return hoverText
})

// Code view
define('/trace/code_bubble',function(require){

  var fn = require("../core/fn")
  var ui = require("../core/ui")

  var ac = require("../core/acorn")

  var ct = require("../core/controls")
  var tm = require("../core/text_mix")
  var ts = require("../core/text_shaders")
  var gl = ui.gl

  // Styling
  var ft1 = ui.gl.sfont(
    navigator.platform.match(/Mac/)?
    "12px Menlo":
    "12px Lucida Console")

  function codeBubble(g){

    // background rect
    var bg = ui.group({l:1})
    bg.set(g)
    // bubble border
    var border = ct.innerShadow({
      radius: 10,
      stepa:1.05,
      stepb:1.15,
      inner:'t.codeBg',
      outer:'alpha(t.codeBg,0)'
    })
    border._p = bg
    // title area
    var title = ui.rect({sel:0,f:'mix(t.codeHover,t.codeMark,n.sel)', y:10, h:30, x:10, w:'p.w - 20'})
    title._p = bg
    //title._p = bg
    bg.title = title

    // code body
    var body = bg.body = ui.rect({f:'t.codeBg', x:10, y:40, h:'p.h - (n.y+10)', w:'p.w - 20'})
    body._p = bg

    // scrollbars
    body._v_ = ct.vScrollHider({h:'p.h - 10'})
    body._h_ = ct.hScrollHider({w:'p.w - 10'})

    // head scrollers
    title._v_ = ct.vScroll({h:'p.h - 10'})
    title._h_ = ct.hScroll({w:'p.w - 10'})

    title.font = ft1
    body.font = ft1
    //|  rendering

    // shaders+-
    body.sh = title.sh = {
      text: ui.gl.getShader(ts.codeText), // text
      select: ui.gl.getShader(ts.selectRect), // selection
      cursor: ui.rect.drawer({f:'t.codeCursor'}), // cursor
      line: ui.rect.drawer({f:'t.codeLineBg'}), // linemark
      lrShadow: ui.rect.drawer({f:'mix(vec4(0,0,0,0.2),vec4(0,0,0,0),c.x)'}), // dropshadow
      topShadow: ui.rect.drawer({f:'mix(t.codeBg,vec4(0,0,0,0),c.y)'})
    }

    // mix in behaviors
    tm.viewport(body)
    tm.cursors(body)
    tm.drawing(body)
    tm.storage(body)

    // mix in title stuff
    tm.viewport(title)
    tm.cursors(title)
    tm.drawing(title)
    tm.storage(title)

    title.vps.gy = 5
    title.vps.gx = 2
    body.vps.gx = 2

    // unhook scrollwheel
    title.s = null
    body.s = null
    // forward scrollbar scroll message
    title._h_.s = body._h_.s = bg._p.s
    title._v_.s = body._v_.s = bg._p.s

    //bg.titleBuf = body.sh.text.alloc(1024)

    title.l = function(){
      ui.view(title, title.vps.o)
      title.drawSelection()
      if(title.text){
        title.drawText()
      }
    }

    /*title.m = function(){
      ui.cursor('default')
    }*/

    // rendering
    body.l = function(){
      ui.view(body, body.vps.o)

      if(!body._v_.pg) body.size()
      // update line numbers
/*
      body.linesUpdate(ui.t.codeLine)
      body.drawLineMarks()
      body.drawLines()
*/
      //ui.clip(body.vps.o.x + body.vps.gx, body.vps.o.y, body.vps.o.w - body.vps.gx, body.vps.o.h)
      body.drawSelection()
      if(body.text){
        body.drawText()
      }
      //body.drawCursors()
      //ui.clip(body.vps.o.x, body.vps.o.y, body.vps.o.w, body.vps.o.h)
      //body.drawShadows()
    }

    // doubleclick
    body.u = function(){
      // dump file/line
      var c = body.vcs.l.first()
      if(c && bg.clickLine)
        bg.clickLine(body.file.file, c.y)
      // send rpc to server to open file/line
      // make configurable open using .tracegl
    }

    // resets the view to the last line
    bg.resetLine = function(){
      body.view(0, body.line, 0, 1, 2)
    }
    function setTitle(m){
      var v = bg._p._p._p._p.hoverView
      var tdb = body.tdb

      var l = tdb.lineDict[m.i]
      var f = tdb.fileDict[l.fid]

      v.clearText()

      // filename
      v.addFormat(f.longName + " line " + l.y, tdb.colors)
      v.endLine()
      var mod = '\f'+tdb.modColor( f.shortName )+f.shortName
      // lets output filename
      v.addFormat(mod + ' \fi' + l.n + "("+(l.a.length?"":")"), tdb.colors)
      v.endLine()
      // then function arguments
      for(var i = 0;i<l.a.length;i++){
        var e = i < l.a.length - 1
        v.addFormat( '   \ft'+l.a[i] + '\fa = ' + tdb.fmt(m.a[i], 255) + (e?",":""), tdb.colors )
        v.endLine()
      }
      if(m.r && m.r.v !== '_$_undefined' && m.r.v !== undefined){
        v.addFormat((l.a.length?")":"")+' '+tdb.fmtCall(m.r), tdb.colors)
        v.endLine()
      } else {
        if(l.a.length){
          v.addFormat(")", tdb.colors)
          v.endLine()
        }
      }
    }

    bg.setTitle = function(m, tdb){
      var h = 0
       body.y = h + 10
      title.h = h + 10
      delete title.vps.o.h // cause height to be recalculated in v_
      title.v_()

      // then function return
      return h
    }

    // update bubble with content
    bg.setBody = function(m, tdb, file, line, height){
      // format trace message in bubble
      body.setStorage(file)
      body.file = file
      bg.msg = m
      body.tdb = tdb

      delete body.vps.o.h // cause height to be recalculated in v_
      bg.h = height
      body.v_()
      body.line = line - 1
      body.view(0, body.line, 0, 1, 2)

      body.mcs.clear()
      // mark booleans from return value message
      var r = m.r
      bg.ret_obj = r
      for(var k in r){
        var l = tdb.lineDict[k.slice(1)]
        //fn(r, l)
        if(!l) continue
        // boolean logic
        if(k.charAt(0) == 'b'){
          var c = body.mcs.new(l.x, l.y - 1, l.ex, l.ey - 1)
          var v = r[k]
          if(v == '_$_undefined' || v=='_$_NaN' || !v) c.fg = ui.t.codeExNone
          else c.fg = ui.t.codeExOnce
          c.jmp = c.lst = null
          c.type = 'logic'
          c.value = r[k]
        } else
        // loop counters
        if(k.charAt(0) == 'l'){
          var c = body.mcs.new(l.x, l.y - 1, l.ex, l.ey - 1)
          var v = r[k]
          if(v == 0) c.fg = ui.t.codeExNone
          else if (v == 1) c.fg = ui.t.codeExOnce
          else c.fg = ui.t.codeExMany
          c.jmp = c.lst = null
          c.type = 'loop x'
          c.value = r[k]
        } else
        // assignments
        if(k.charAt(0) == 'a' && k.length>1){
          var c = body.mcs.new(l.x, l.y - 1, l.ex, l.ey - 1)
          var v = r[k]
          c.fg = ui.t.codeArg
          c.jmp = c.lst = null
          c.type = '='
          c.value = r[k]
        } else
        // exceptions
        if(k.charAt(0) == 'x'){
          var c = body.mcs.new(l.x, l.y - 1, l.ex, l.ey - 1)
          var v = r[k]
          c.fg = ui.t.codeExOnce
          c.jmp = c.lst = null
          c.type = 'exception'
          c.value = r[k]
        }
      }

      // lets mark the main function args
      var l = tdb.lineDict[m.i]
      if(l.a) for(var i = 0;i<l.a.length;i++){
        var a = l.a[i]
        var c = body.mcs.new(a.x, a.y - 1, a.ex, a.ey - 1)
        c.type = a.n +' ='
        c.value = m.a[i]
        c.jmp = c.lst = null
        c.fg = ui.t.codeArg
      }

      // mark the function itself and the return point
      // we should mark jmp = 2
      var c = body.mcs.new(l.sx, l.sy - 1, l.sx + 8, l.sy - 1)
      c.type = null
      c.value = m
      c.jmp = 2
      c.lst = null
      c.fg = ui.t.codeSelf

      if(r){
        var l = tdb.lineDict[r.i]
        if(l && l.r){
          var c = body.mcs.new(l.x, l.y - 1, l.x + 6, l.y - 1)
          c.type = 'returns'
          c.value = r.v
          c.jmp = 1
          c.lst = null
          c.fg = ui.t.codeSelf
        }
      }

      var maxlst = 100

      var sites = {}
      // lets mark function calls
      var fc = m.cs
      while(fc){
        // check if we are re-marking a callsite, ifso
        // store more calls on our marker
        if(fc.r){
          // translate the call site line
          var l = tdb.lineDict[fc.r.c]
          if(l){
            // add to existing callsite
            var id = fc.r.c
            var c
            if(sites[id]) c = sites[id]
            else {
              c = (sites[id] = body.mcs.new(l.x, l.y - 1, l.ex, l.ey - 1))
              c.lst = []
              c.args = []
              c.jmp = fc
              c.fg = ui.t.codeCall
            }
            if(bg.prev && bg.prev.msg == fc){
              c.fg = ui.t.codeSelf
            }

            // lets mark all function arguments
            c.lst.unshift({
              type:'returns',
              value:fc.r?fc.r.v:null
            })

            // lets mark all function arguments
            // we have 2 'unique' call patterns called call and apply
            // in apply we have this, array
            // in call we have this, ..args..
            var args = c.args
            // the function line
            var fl = tdb.lineDict[fc.i]
            if(l.a){
              for(var i = 0;i<l.a.length;i++){
                var a = l.a[i]
                if(a){
                  var c = args[i]
                  if(!c){
                    c = (args[i] = body.mcs.new(a.x, a.y - 1, a.ex, a.ey - 1))
                    c.lst = []
                  }
                  c.fg = ui.t.codeArg
                  // lets mark all function arguments

                  if(l.ce){ // its a call or apply
                    if(i == 0){
                      c.lst.push({type:"this", value:"?"})
                    } else{
                      if(l.ce == 1){ // call
                        if(c.lst.length<maxlst) c.lst.unshift({
                          type:(fl.a[i - 1] ? fl.a[i - 1].n : '?') +' =',
                          value:fc.a?fc.a[i - 1]:null
                        })
                      } else { // its an apply
                        //if(c.lst.length) c.lst = []
                        //for(var j = 0;j < fc.a.length;j++)
                        if(c.lst.length<maxlst)
                        c.lst.push({
                          type:null,//(fl.a[j] ? fl.a[j].n : '?') +' =',
                          value:fc,//fc.a?fc.a[j]:null
                        })
                      }
                    }
                  } else {
                    if(c.lst.length<maxlst) c.lst.unshift({
                      type:(fl.a[i] ? fl.a[i].n : '?') +' =',
                      value:fc.a?fc.a[i]:null
                    })
                  }
                }
              }
            }
          }
        }
        fc = fc.nc
      }

      // lets mark function sub closure calls
      sites = {}
      var rblock = {}
      function addClosures(m){
        var fc = m.us
        while(fc){
          if(rblock[fc.g]) return
          rblock[fc.g] = 1

          var l = tdb.lineDict[fc.i]
          if(l){
            // add to existing callsite
            var c
            var id = fc.i
            if(sites[id]) c = sites[id]
            else {
              c = (sites[id] = body.mcs.new(l.sx, l.sy - 1, l.sx + 8, l.sy - 1))
              c.lst = []
              c.jmp = fc
              c.fg = ui.t.codeCall
            }
            if(c.lst.length<maxlst){
              c.lst.unshift({
                type:null,
                value:fc//fc.r?fc.r.v:l.n
              })
            }
          }
          addClosures(fc)
          fc = fc.nu
        }
      }
      addClosures(m, 0)
    }

    body.o = function(){
      var v = bg._p._p._p._p.hoverView
      v.hide()
    }

    var lx, ly, lc

    var oldr = body.r
    body.r = function(){
      oldr()
      var l = lc
      if(l && l.jmp){
        // jump to parent function
        if(l.jmp === 1){
          if(!bg.next || bg.next.l === -1)return
          var sv = bg._p._p._p._p.stackView
          sv.ly = -1
          sv.selectFirst(bg.stacky + bg.stackh)
        } else if (l.jmp === 2){
          var m = body.tdb.find(bg.msg.u)
          if(m) bg._p._p._p._p.selectCall(m.y)
        } else {
          bg._p._p._p._p.selectCall(l.jmp.y)
        }
      }
    }

    function formatCall(m, v, tdb){
      var up = tdb.msgIds[m.u]
      v.addFormat((up?((m.t - up.t)+'ms '):'')+tdb.fmtCall(m), tdb.colors)
      if(m.r && m.r.v) v.addFormat(' '+tdb.fmtCall(m.r), tdb.colors)
    }

    body.markerHover = function(m){
      // make sure we only process on change
      if(ui.mx == lx && ui.my == ly && m == lc)return
      lx = ui.mx, ly = ui.my, lc = m

      var tdb = body.tdb

      // when we get a function call, or 'null' we show the hoverview
      var v = bg._p._p._p._p.hoverView
      if(!m){ // no hover
        v.hide()
        return
      }
      else {
        v.clearText()
        if(m.lst){
          var l = m.lst.length
          for(var i = 0;i<l;i++){
            if(m.lst[i].type){
              v.addFormat((l>1?i+': ':'')+m.lst[i].type+' '+tdb.fmt(m.lst[i].value, 255), tdb.colors)
            } else {
              formatCall(m.lst[i].value, v, tdb)
            }
            v.endLine()
          }
        } else {
          if(m.type){
            v.addFormat(m.type+' '+tdb.fmt(m.value, 255), tdb.colors)
          } else {
            formatCall(m.value, v, tdb)
          }
          v.endLine()
        }
        // if the width > bubblebg we should move the hover to the left
        v.fit(ui.mx, ui.my)
      }
      // we get this fired when someone hovers over a marker.
      ui.gl.cursor('pointer')
    }
    return bg
  }
  return codeBubble
})

define('/trace/trace_client',function(require){
  settings = settings || {}
  document.title = "traceGL"

  var fn = require("../core/fn")
  var ui = require("../core/ui")
  if(!ui.gl) return

  var ct = require("../core/controls")

  var themes = require("../core/themes")

  var theme_type = settings.theme || 'dark'
  ui.theme(themes[settings.theme] || themes.dark)// set theme

  var ioChannel = require("../core/io_channel")

  var traceDb = require('./trace_db')
  var codeDb = require('./code_db')
  var listView = require('./list_view')
  var codeView = require("./code_view")
  var hoverText = require("./hover_text")
  var codeBubble = require("./code_bubble")

  var pass = fn.sha1hex("p4ssw0rd")
  var sess = fn.rndhex(8)
  var chan = ioChannel("/io_"+sess+"_"+pass)
  var dt = fn.dt()

/*
  var instrument = require('./instrument')
  function test(){
     (a?a:b)
  }

  var t = instrument('test', test.toString(), 0, 1)
  console.log(t.clean)
  return
*/
  window.ui = ui

  // theme reloading when file change
  define.reload = function(t){
    if(t.indexOf('themes.js') != -1){ // reload themes
      require.reload('../core/themes', function(t){
        ui.theme(t.dark)
        ui.redraw()
      })
      return 1 // dont refresh the browser
    }
  }
  ui.load(function(){
    var tdb = traceDb()
    var sdb = traceDb(tdb)
    var cdb = codeDb()

    var paused
    var paused_m

    // io channel data function
    chan.data = function(m){
      if(m.dict){
        // parse incoming source
        cdb.parse(m.f, m.src)
        return tdb.addDict(m)
      }
      else if(m.settings){
        settings = m.settings
        theme_type = settings.theme || 'dark'
        ui.theme(themes[settings.theme] || themes.dark)
        ui.redraw()
      } else {
        // we clicked pause, but we wont actually pause untill depth = 1
        if(paused && !paused_m)  if(m.d == 1) paused_m = paused;
        // we unpaused, but we wont unpause till we reach a depth = 1
        if(!paused && paused_m)  if(m.d == 1) paused_m = paused

        if(paused_m) return

        if(tdb.processTrace(m) && searchBox.t.length && !searcher && matchSearch(m)){
          sdb.addTrace(m)
          sdb.changed()
        }
      }
    }

    var bubbles = fn.list('prev', 'next')

    function clearTraces(){
      // clear the traceDb, searchDb
      // clear the bubbles and the
      tdb.clearText()
      sdb.clearText()
      tdb.msgIds = {}
      tdb.firstMessage = null
      stackView.clearText()
      miniView.tvc = null
      bigView.tvc = null
      sminiView.tvc = null
      sbigView.tvc = null
      var b = bubbles.first()
      while(b){
        b.hide()
        b = b.next
      }
      tdb.changed()
      sdb.changed()
      ui.redraw()
    }

    function selectBubble(b, scroll){
      var n = bubbles.first()
      while(n){
        if(n != b) n.title.sel = 0
        n = n.next
      }
      b.title.sel = 1
      if(scroll){
        var v = bubbleBg._v_
        v.ds(b.y - v.mv)
        ui.redraw(bubbleBg)
      }
    }

    function selectCall(y){
      //if(ui.break)debugger;
      //fn('select call', y)
      miniView.selectFirst(y)
      //m.viewChange(0, lc.jmp.y)
      bigView.view(0, y, 0, 1, 1)
      // scroll up
      bubbleBg._v_.ds(-bubbleBg._v_.mv)
      stackView.ly = -1
      stackView.selectFirst(0)
    }

    // respond to a selectTrace by building all the callbubbles
    sdb.selectTrace = function(m){
      ui.dbg = m
      // lets select the  m in tdb
      selectCall(m.y)
    }

    tdb.selectTrace = function(m){
      //fn('selectTrace')
      var y = 0 // y pos
      var stacky = 0 // callstack counter
      var spacing = 1 // spacing between bubbles
      var rev = false // reverse callstack
      var b = {next:bubbles.first()}
      var max = 64
      stackView.clearText()

      if(rev) while(m.p) m.p.c = m, m = m.p
      while(m && max >0){
        max--
        // lookup line and file
        var l = tdb.lineDict[m.i]
        var f = tdb.fileDict[l && l.fid]
        if(!f){m = m.c;continue;}

        // find available bubble for stack
        if(b) b = b.next
        if(!b){
          b = codeBubble({x:1, y:y, w:'p.w', h:300, _p:bubbleBg})
          bubbles.add(b);
          // sync selection between title and
          (function(prev){
            b.title.p = function(n){
              var b = n._p
              b.resetLine()
              stackView.selectFirst(stackView.ly = b.stacky)
              selectBubble(b)
              ui.redraw(bubbleBg)
              prev()
            }
          })(b.title.p)
          b.clickLine = function(file, line){
            chan.send({t:'open',file:file,line:line})
          }
        }

        // stackView cursor
        b.stacky = stacky

        // build up the stackView
        stackView.addFormat( tdb.fmtCall(m), tdb.colors ), stacky++
        stackView.endLine(b)
        if(m.r && m.r.v !== '_$_undefined' && m.r.v !== undefined){
          stackView.addFormat( ' '+tdb.fmtCall(m.r), tdb.colors ), stacky++
          stackView.endLine(b)
          b.stackh = 2
        } else b.stackh = 1

        // set the title on the bubble
        var headSize = b.setTitle(m, tdb)

        // position bubble
        b.x = 0
        b.y = y

        // select text in bubble
        var file = cdb.files[f.longName]
        var line = l.y

        // get the function body height
        var height = (l.ey - l.y + 1) * b.body.vps.sy + headSize + 20
        if(height > 6000) height = 6000

        // check if we have to fetch the file
        b.setBody( m, tdb, file, line, height)
        y += height + spacing
        // flip visibility
        if(b.l == -1) b.show()//b.l = b.l2

        // remove callstack reversal
        if(rev){
          var c = m.c
          delete m.c
          m = c
        }
        else m = m.p
      }
      // set total view width
      bubbleBg.vSize = y
      bubbleBg.v_()
      // reset cursor
      stackView.selectFirst(0)
      stackView.hy = 0
      stackView.v_()
      //bubbleBg._h_.ds(bubbleBg.hSize - bubbleBg.hScroll)
      // scroll to end
      ui.redraw()
      // hide left over bubbles
      b = b.next
      while(b){
        if(b.l != -1) b.hide()
        b = b.next
      }
    }

    // main UI
    var mainGroup
    var searchGroup
    var miniView
    var bigView
    var sminiView
    var sbigView
    var hoverView
    var sourceView
    var bubbleBg
    var searchBox

    var searcher

    var pattern = 0
    var regexp = 0
    function matchSearch(m){
      var s = searchBox.t
      if(s != pattern){
        if(s.charAt(0) == '/'){
          try{
            regexp = new RegExp(s.slice(1),"ig")
          } catch(e){
            regexp = 0
          }
        } else regexp = 0
        pattern = s
      }
      if(!regexp)  return m.s.indexOf( pattern ) != -1
      else return m.s.match( regexp ) != null
    }

    function doSearch(){
      var s = searchBox.t
      if(s.length){
        mainGroup.hide()
        searchGroup.show()
        // first we clear the sdb
        sdb.clearText()
        if(searcher) clearInterval(searcher)
        sminiView.tvc = null
        sbigView.tvc = null
        var n = tdb.text.first()
        searcher = setInterval(function(){
          var dt = fn.dt()
          // we process n and a few others
          var ntraces = 1000
          var nblocks = 500
          while(n && nblocks>0 && ntraces>0){
            // go through the lines
            for(var i = 0;i<n.ld.length;i++){
              var m = n.ld[i]
              // simple search
              if(matchSearch(m)){
                ntraces--
                sdb.addTrace(m)
              }
            }
            nblocks--
            n = n._d
          }
          sdb.changed()
          if(!n) clearInterval(searcher), searcher = 0
        }, 0)

      } else {
        mainGroup.show()
        searchGroup.hide()
      }
    }

    // main UI
    ui.group(function(n){
      ui.rect(function(n){
        n.f = 't.defbg'
        n.h = 32
        ct.button({
          y:2,
          x:2,
          w:80,
          t:'Theme',
          c:function(){
            if(theme_type == 'dark') theme_type = 'light'
            else theme_type = 'dark'
            ui.theme(themes[theme_type])
          }
        })
        ct.button({
          y:2,
          x:84,
          w:80,
          t:'Clear',
          c:function(){
            clearTraces()
          }
        })
        ct.button({
          y:2,
          w:80,
          x:166,
          t:'Pause',
          c:function(n){
            if(!n.paused){
              paused = n.paused = true
              n.ohc = n.hc
              n.hc = 'red'
            } else {
              paused = n.paused = false
              n.hc = n.ohc
            }

            // restart the nodejs app under testing and clears traces
          }
        })
        ct.button({
          y:2,
          x:248,
          w:22,
          t:'x',
          c:function(){
            searchBox.t = ""
            doSearch()
          }
        })
        searchBox = ct.edit({
          empty:'search filter',
          y:2,
          x:272,
          w:'p.w - n.x',
          c:function(n){
            doSearch()
          }
        })
      })
      ct.vSplit(function(n){
        n.y = 28

        ui.group(function(n){
          n.h = 200
            ui.test = function(){
              fn(n.eval('h'))
            }
          mainGroup = ct.hSplit(function(n){
            miniView = listView({w:267, zm:0, db:tdb})
            bigView = listView({db:tdb, cursor:miniView})
            // we also have a textView here which we flip to visible occasionally
            // set alloc shader
            cdb.sh.text = miniView.sh.text
          })
          searchGroup = ct.hSplit(function(n){
            sminiView = listView({w:267, zm:0, db:sdb})
            sbigView = listView({db:sdb, cursor:sminiView})
            sbigView.vps.gx = 7
          })
          searchGroup.hide()
        })

        ct.hSplit(function(n){
          stackView = listView({w:267})
          stackView.vps.gx = 5
          stackView.vps.gy = 5
          stackView.ly = -1
          stackView.viewChange = function(x, y){
            if(stackView.ly != y){
              stackView.ly = y
              var c = stackView.dcs.l.first() || stackView.vcs.l.first()
              if(c && c.d) selectBubble(c.d, true)
            }
          }
          bubbleBg = ui.rect(function(n){
            n.f = 't.defbg'//mix(vec4(.2,.2,.2,1),vec4(.4,.4,.4,1),c.y)'
            n.l = 1
            n._h_ = ct.hScrollHider()
            n._v_ = ct.vScrollHider()
            ct.hvScroll(n)
          })
        })
      })
      // the hover info view
      n.hoverView = hoverView = hoverText()
      n.miniView = miniView
      n.bigView = bigView
      n.bubbleBg = bubbleBg
      n.stackView = stackView
      n.selectCall = selectCall
      hoverView.show(false)
    })
    chan.send({t:'join'})
    ui.drawer()
  })
})

define.factory["/trace/trace_server"](define.mkreq("/trace/trace_server"))
