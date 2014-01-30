module.exports = {
  "theme" : "dark", // other theme: light
  "ui":2000, // UI port
  "tgt":2080, // browser JS port
  "do":[], // only trace files matching
  "no":[], // ignore files matching ":match" for string or "/match" for regexp
  "editors" : { // editor paths per platform, modify these to set up your editor
    "darwin":{
      "sublime3":{
        "bin":"/Applications/Sublime Text 3.app/Contents/SharedSupport/bin/subl",
        "args":["$file:$line"]
      },
      "sublime2":{
        "bin":"/Applications/Sublime Text 2.app/Contents/SharedSupport/bin/subl",
        "args":["$file:$line"]
      },
      "textmate":{
        "bin":"/Applications/TextMate.app/Contents/Resources/mate",
        "args":["$file","--line","$line"]
      }
    },
    "win32":{},
    "sunos":{},
    "linux":{},
    "freebsd":{}
  }
};
