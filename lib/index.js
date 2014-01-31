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
define('/trace/trace_db', require('./trace/trace_db'));
define('/core/text_shaders', require('./core/text_shaders'));
define('/trace/code_db', require('./trace/code_db'));
define('/trace/list_view', require('./trace/list_view'));
define('/trace/code_view', require('./trace/code_view'));
define('/trace/hover_text', require('./trace/hover_text'));
define('/trace/code_bubble', require('./trace/code_bubble'));
define('/trace/trace_client', require('./trace/trace_client'));

define.factory["/trace/trace_server"](define.mkreq("/trace/trace_server"));
