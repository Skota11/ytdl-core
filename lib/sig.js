//Thanks to tieubao9k

const querystring = require("querystring");
const Cache = require("./cache");
const utils = require("./utils");
const vm = require("vm");

exports.cache = new Cache(1);

exports.getFunctions = (html5playerfile, options) =>
  exports.cache.getOrSet(html5playerfile, async () => {
    try {
      const body = await utils.request(html5playerfile, options);
      const functions = exports.extractFunctions(body);
      
      exports.cache.set(html5playerfile, functions);
      return functions;
    } catch (error) {
      throw error;
    }
  });

const VARIABLE_PART = "[a-zA-Z_\\$][a-zA-Z_0-9\\$]*";
const VARIABLE_PART_DEFINE = "\\\"?" + VARIABLE_PART + "\\\"?";
const BEFORE_ACCESS = "(?:\\[\\\"|\\.)";
const AFTER_ACCESS = "(?:\\\"\\]|)";
const VARIABLE_PART_ACCESS = BEFORE_ACCESS + VARIABLE_PART + AFTER_ACCESS;
const REVERSE_PART = ":function\\(\\w\\)\\{(?:return )?\\w\\.reverse\\(\\)\\}";
const SLICE_PART = ":function\\(\\w,\\w\\)\\{return \\w\\.slice\\(\\w\\)\\}";
const SPLICE_PART = ":function\\(\\w,\\w\\)\\{\\w\\.splice\\(0,\\w\\)\\}";
const SWAP_PART = ":function\\(\\w,\\w\\)\\{" +
    "var \\w=\\w\\[0\\];\\w\\[0\\]=\\w\\[\\w%\\w\\.length\\];\\w\\[\\w(?:%\\w.length|)\\]=\\w(?:;return \\w)?\\}";

const DECIPHER_REGEXP = 
    "function(?: " + VARIABLE_PART + ")?\\(([a-zA-Z])\\)\\{" +
    "\\1=\\1\\.split\\(\"\"\\);\\s*" +
    "((?:(?:\\1=)?" + VARIABLE_PART + VARIABLE_PART_ACCESS + "\\(\\1,\\d+\\);)+)" +
    "return \\1\\.join\\(\"\"\\)" +
    "\\}";

const HELPER_REGEXP = 
    "var (" + VARIABLE_PART + ")=\\{((?:(?:" +
    VARIABLE_PART_DEFINE + REVERSE_PART + "|" +
    VARIABLE_PART_DEFINE + SLICE_PART + "|" +
    VARIABLE_PART_DEFINE + SPLICE_PART + "|" +
    VARIABLE_PART_DEFINE + SWAP_PART +
    "),?\\n?)+)\\};";

const FUNCTION_TCE_REGEXP = 
    "function(?:\\s+[a-zA-Z_\\$][a-zA-Z0-9_\\$]*)?\\(\\w\\)\\{" +
    "\\w=\\w\\.split\\((?:\"\"|[a-zA-Z0-9_$]*\\[\\d+])\\);" +
    "\\s*((?:(?:\\w=)?[a-zA-Z_\\$][a-zA-Z0-9_\\$]*(?:\\[\\\"|\\.)[a-zA-Z_\\$][a-zA-Z0-9_\\$]*(?:\\\"\\]|)\\(\\w,\\d+\\);)+)" +
    "return \\w\\.join\\((?:\"\"|[a-zA-Z0-9_$]*\\[\\d+])\\)}";
    
const SIG_FUNCTION_TCE_PATTERN = 
    "function\\(\\s*([a-zA-Z0-9$])\\s*\\)\\s*\\{" +
    "\\s*\\1\\s*=\\s*\\1\\[(\\w+)\\[\\d+\\]\\]\\(\\2\\[\\d+\\]\\);" +
    "([a-zA-Z0-9$]+)\\[\\2\\[\\d+\\]\\]\\(\\s*\\1\\s*,\\s*\\d+\\s*\\);" +
    "\\s*\\3\\[\\2\\[\\d+\\]\\]\\(\\s*\\1\\s*,\\s*\\d+\\s*\\);" +
    ".*?return\\s*\\1\\[\\2\\[\\d+\\]\\]\\(\\2\\[\\d+\\]\\)\\};";

const TCE_SIG_FUNCTION_ACTIONS_PATTERN =
    "var\\s*([a-zA-Z0-9$_]+)\\s*=\\s*\\{\\s*[a-zA-Z0-9$_]+\\s*:\\s*function\\((\\w+|\\s*\\w+\\s*,\\s*\\w+\\s*)\\)\\s*\\{\\s*(\\s*var\\s*\\w+=\\w+\\[\\d+\\];\\w+\\[\\d+\\]\\s*=\\s*\\w+\\[\\w+\\s*\\%\\s*\\w+\\[\\w+\\[\\d+\\]\\]\\];\\s*\\w+\\[\\w+\\s*%\\s*\\w+\\[\\w+\\[\\d+\\]\\]\\]\\s*=\\s*\\w+\\s*\\},|\\w+\\[\\w+\\[\\d+\\]\\]\\(\\)\\},)\\s*[a-zA-Z0-9$_]+\\s*:\\s*function\\((\\s*\\w+\\w*,\\s*\\w+\\s*|\\w+)\\)\\s*\\{(\\w+\\[\\w+\\[\\d+\\]\\]\\(\\)|\\s*var\\s*\\w+\\s*=\\s*\\w+\\[\\d+\\]\\s*;\\w+\\[\\d+\\]\\s*=\\w+\\[\\s*\\w+\\s*%\\s*\\w+\\[\\w+\\[\\d+\\]\\]\\]\\s*;\\w+\\[\\s*\\w+\\s*%\\s*\\w\\[\\w+\\[\\d+\\]\\]\\]\\s*=\\s*\\w+\\s*)\\},\\s*[a-zA-Z0-9$_]+\\s*:\\s*function\\s*\\(\\s*\\w+\\s*,\\s*\\w+\\s*\\)\\{\\w+\\[\\w+\\[\\d+\\]\\]\\(\\s*\\d+\\s*,\\s*\\w+\\s*\\)\\}\\};";

const N_TRANSFORM_REGEXP = 
    "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
    "var\\s*(\\w+)=(?:\\1\\.split\\(.*?\\)|String\\.prototype\\.split\\.call\\(\\1,.*?\\))," +
    "\\s*(\\w+)=(\\[.*?]);\\s*\\3\\[\\d+]" +
    "(.*?try)(\\{.*?})catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
    '\\s*return"[\\w-]+([A-z0-9-]+)"\\s*\\+\\s*\\1\\s*}' +
    '\\s*return\\s*(\\2\\.join\\(""\\)|Array\\.prototype\\.join\\.call\\(\\2,.*?\\))};';

const N_TRANSFORM_TCE_REGEXP = 
    "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
    "\\s*var\\s*(\\w+)=\\1\\.split\\(\\1\\.slice\\(0,0\\)\\),\\s*(\\w+)=\\[.*?];" +
    ".*?catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
    "\\s*return(?:\"[^\"]+\"|\\s*[a-zA-Z0-9_$]*\\[\\d+])\\s*\\+\\s*\\1\\s*}" +
    "\\s*return\\s*\\2\\.join\\((?:\"\"|[a-zA-Z_0-9$]*\\[\\d+])\\)};";

const N_FUNCTION_TCE_PATTERN =
    "function\\s*\\((\\w+)\\)\\s*\\{var\\s*\\w+\\s*=\\s*\\1\\[\\w+\\[\\d+\\]\\]\\(\\w+\\[\\d+\\]\\)\\s*,\\s*\\w+\\s*=\\s*\\[.*?\\]\\;.*?catch\\(\\s*(\\w+)\\s*\\s*\\)\\s*\\{return\\s*\\w+\\[\\d+\\](\\+\\1)?\\}\\s*return\\s*\\w+\\[\\w+\\[\\d+\\]\\]\\(\\w+\\[\\d+\\]\\)\\}\\;";

const TCE_GLOBAL_VARS_REGEXP = 
    "(?:^|[;,])\\s*(var\\s+([\\w$]+)\\s*=\\s*" +
    "(?:" +
    "([\"'])(?:\\\\.|[^\\\\])*?\\3" +  
    "\\s*\\.\\s*split\\((" +
    "([\"'])(?:\\\\.|[^\\\\])*?\\5" +
    "\\))" +
    "|" +  
    "\\[\\s*(?:([\"'])(?:\\\\.|[^\\\\])*?\\6\\s*,?\\s*)+\\]" +
    "|" +  
    "\"[^\"]*\"\\.split\\(\"[^\"]*\"\\)" +
    "))(?=\\s*[,;])";

const TCE_GLOBAL_VARS_PATTERN_JAVA = 
    "('use\\s*strict';)?" +
    "(?<code>var\\s*" +
    "(?<varname>[a-zA-Z0-9_$]+)\\s*=\\s*" +
    "(?<value>" +
    "(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
    "\\.split\\(" +
    "(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
    "\\)" +
    "|" +
    "\\[" +
    "(?:(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
    "\\s*,?\\s*)*" +
    "\\]" +
    "|" +
    "\"[^\"]*\"\\.split\\(\"[^\"]*\"\\)" +
    ")" +
    ")";

const PATTERN_PREFIX = "(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?";
const REVERSE_PATTERN = new RegExp(PATTERN_PREFIX + REVERSE_PART, "m");
const SLICE_PATTERN = new RegExp(PATTERN_PREFIX + SLICE_PART, "m");
const SPLICE_PATTERN = new RegExp(PATTERN_PREFIX + SPLICE_PART, "m");
const SWAP_PATTERN = new RegExp(PATTERN_PREFIX + SWAP_PART, "m");

const DECIPHER_ARGUMENT = "sig";
const N_ARGUMENT = "ncode";
const DECIPHER_FUNC_NAME = "DisTubeDecipherFunc";
const N_TRANSFORM_FUNC_NAME = "DisTubeNTransformFunc";

class TCEVariable {
  constructor(name, code, value) {
    this.name = name;
    this.code = code;
    this.value = value;
  }

  getEscapedName() {
    return this.name.replace(/\$/g, "\\$");
  }

  getName() {
    return this.name;
  }

  getCode() {
    return this.code;
  }

  getValue() {
    return this.value;
  }
}

const extractDollarEscapedFirstGroup = (pattern, text) => {
  const match = text.match(pattern);
  return match ? match[1].replace(/\$/g, "\\$") : null;
};

const extractTCEVariable = (body) => {
  const tceVarsMatch = body.match(new RegExp(TCE_GLOBAL_VARS_REGEXP, "m"));
  if (tceVarsMatch) {
    return new TCEVariable(
      tceVarsMatch[2], 
      tceVarsMatch[1], 
      tceVarsMatch[1].split("=")[1].trim()
    );
  }
  
  const tceVarsMatchJava = body.match(new RegExp(TCE_GLOBAL_VARS_PATTERN_JAVA));
  if (tceVarsMatchJava && tceVarsMatchJava.groups) {
    return new TCEVariable(
      tceVarsMatchJava.groups.varname,
      tceVarsMatchJava.groups.code,
      tceVarsMatchJava.groups.value
    );
  }
  
  return null;
};

const extractSigFunctionTCE = (body, tceVariable) => {
  if (!tceVariable) return null;
  
  try {
    const sigFunctionMatch = body.match(new RegExp(SIG_FUNCTION_TCE_PATTERN));
    if (!sigFunctionMatch) return null;
    const sigFunctionActionsMatch = body.match(new RegExp(TCE_SIG_FUNCTION_ACTIONS_PATTERN));
    if (!sigFunctionActionsMatch) return null;
    
    return {
      sigFunction: sigFunctionMatch[0],
      sigFunctionActions: sigFunctionActionsMatch[0],
      actionVarName: sigFunctionActionsMatch[1] || "Dw" 
    };
  } catch (e) {
    return null;
  }
};

const extractNFunctionTCE = (body, tceVariable) => {
  if (!tceVariable) return null;
  
  try {
    const nFunctionMatch = body.match(new RegExp(N_FUNCTION_TCE_PATTERN, "s"));
    if (!nFunctionMatch) {
      const nTceMatch = body.match(new RegExp(N_TRANSFORM_TCE_REGEXP, "s"));
      if (!nTceMatch) return null;
      return nTceMatch[0];
    }
    
    let nFunction = nFunctionMatch[0];
    const shortCircuitPattern = new RegExp(
      `;\\s*if\\s*\\(\\s*typeof\\s+[a-zA-Z0-9_$]+\\s*===?\\s*(?:"undefined"|'undefined'|${tceVariable.getEscapedName()}\\[\\d+\\])\\s*\\)\\s*return\\s+\\w+;`
    );
    
    if (shortCircuitPattern.test(nFunction)) {
      nFunction = nFunction.replace(shortCircuitPattern, ";");
    } else {
      const paramMatch = nFunction.match(/function\s*\(\s*(\w+)\s*\)/);
      if (paramMatch) {
        const paramName = paramMatch[1];
        nFunction = nFunction.replace(
          new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${paramName}\\s*;?`, "g"), 
          ""
        );
      }
    }
    
    return nFunction;
  } catch (e) {
    return null;
  }
};

const extractDecipherFunc = (body) => {
  try {
    const tceVariable = extractTCEVariable(body);
    if (tceVariable) {
      
      const tceSigResult = extractSigFunctionTCE(body, tceVariable);
      const nFunction = extractNFunctionTCE(body, tceVariable);
      
      if (tceSigResult && nFunction) {
        const { sigFunction, sigFunctionActions, actionVarName } = tceSigResult;        
        return {
          script: `${tceVariable.getCode()}\n${sigFunctionActions}\nvar ${DECIPHER_FUNC_NAME}=${sigFunction};\nvar ${N_TRANSFORM_FUNC_NAME}=${nFunction};\n`,
          decipher: `${DECIPHER_FUNC_NAME}(${DECIPHER_ARGUMENT});`,
          nTransform: `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`,
          isTCE: true
        };
      } else {
      }
    }

    const helperMatch = body.match(new RegExp(HELPER_REGEXP, "s"));
    if (!helperMatch) {
      return null;
    }

    const helperObject = helperMatch[0];
    const actionBody = helperMatch[2];
    const helperName = helperMatch[1];
    const reverseKey = extractDollarEscapedFirstGroup(REVERSE_PATTERN, actionBody);
    const sliceKey = extractDollarEscapedFirstGroup(SLICE_PATTERN, actionBody);
    const spliceKey = extractDollarEscapedFirstGroup(SPLICE_PATTERN, actionBody);
    const swapKey = extractDollarEscapedFirstGroup(SWAP_PATTERN, actionBody);

    const quotedFunctions = [reverseKey, sliceKey, spliceKey, swapKey]
      .filter(Boolean)
      .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); 

    if (quotedFunctions.length === 0) {
      return null;
    }

    let funcMatch = body.match(new RegExp(DECIPHER_REGEXP, "s"));
    let isTce = false;
    let decipherFunc;

    if (funcMatch) {
      decipherFunc = funcMatch[0];
    } else {
      const tceFuncMatch = body.match(new RegExp(FUNCTION_TCE_REGEXP, "s"));
      if (!tceFuncMatch) {
        return null;
      }

      decipherFunc = tceFuncMatch[0];
      isTce = true;
    }

    let tceVars = "";
    if (isTce) {
      const tceVarsMatch = body.match(new RegExp(TCE_GLOBAL_VARS_REGEXP, "m"));
      if (tceVarsMatch) {
        tceVars = tceVarsMatch[1] + ";\n";
      }
    }
    const result = {
      script: tceVars + helperObject + "\nvar " + DECIPHER_FUNC_NAME + "=" + decipherFunc + ";\n",
      decipher: DECIPHER_FUNC_NAME + "(" + DECIPHER_ARGUMENT + ");",
      isTCE: false
    };
    
    return result;
  } catch (e) {
    return null;
  }
};

const extractNTransformFunc = (body) => {
  try {
    const tceVariable = extractTCEVariable(body);
    if (tceVariable) {
      const nFunction = extractNFunctionTCE(body, tceVariable);
      if (nFunction) {
        return {
          already: true
        };
      }
    }

    let nMatch = body.match(new RegExp(N_TRANSFORM_REGEXP, "s"));
    let isTce = false;
    let nFunction;

    if (nMatch) {
      nFunction = nMatch[0];
    } else {
      const nTceMatch = body.match(new RegExp(N_TRANSFORM_TCE_REGEXP, "s"));
      if (!nTceMatch) {
        return null;
      }

      nFunction = nTceMatch[0];
      isTce = true;
    }

    const paramMatch = nFunction.match(/function\s*\(\s*(\w+)\s*\)/);
    if (!paramMatch) {
      return null;
    }

    const paramName = paramMatch[1];
    const cleanedFunction = nFunction.replace(
      new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${paramName}\\s*;?`, "g"), 
      ""
    );

    let tceVars = "";
    if (isTce) {
      const tceVarsMatch = body.match(new RegExp(TCE_GLOBAL_VARS_REGEXP, "m"));
      if (tceVarsMatch) {
        tceVars = tceVarsMatch[1] + ";\n";
      }
    }

    const result = {
      script: tceVars + "var " + N_TRANSFORM_FUNC_NAME + "=" + cleanedFunction + ";\n",
      nTransform: N_TRANSFORM_FUNC_NAME + "(" + N_ARGUMENT + ");",
      isTCE: false
    };
    return result;
  } catch (e) {
    return null;
  }
};

let decipherWarning = false;
let nTransformWarning = false;

const extractDecipher = body => {
  try { 
    const decipherFuncResult = extractDecipherFunc(body);
    if (!decipherFuncResult && !decipherWarning) {
      console.warn(
        "\x1b[33mWARNING:\x1B[0m Could not parse decipher function.\n" +
          "Stream URLs will be missing.\n" +
          `Please report this issue by uploading the "${utils.saveDebugFile(
            "player-script.js",
            body,
          )}" file on https://github.com/distubejs/ytdl-core/issues/144.`
      );
      decipherWarning = true;
    }
    
    if (decipherFuncResult) {
      try {
        if (decipherFuncResult.isTCE) {
          const scriptText = decipherFuncResult.script + '\n' + decipherFuncResult.decipher;
          return new vm.Script(scriptText);
        }
        const scriptText = decipherFuncResult.script + '\n' + decipherFuncResult.decipher;
        return new vm.Script(scriptText);
      } catch (err) {
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

const extractNTransform = (body, decipherResult) => {
  try {    
    const decipherFuncResult = extractDecipherFunc(body);
    if (decipherFuncResult && decipherFuncResult.isTCE && decipherFuncResult.nTransform) {
      try {
        const scriptText = decipherFuncResult.script + '\n' + decipherFuncResult.nTransform;
        return new vm.Script(scriptText);
      } catch (err) {
      }
    }
    
    const nTransformFuncResult = extractNTransformFunc(body);
    if (nTransformFuncResult && nTransformFuncResult.already) {
      return null;
    }

    if (!nTransformFuncResult && !nTransformWarning) {
      console.warn(
        "\x1b[33mWARNING:\x1B[0m Could not parse n transform function.\n" +
        `Please report this issue by uploading the "${utils.saveDebugFile(
          "player-script.js",
          body,
        )}" file on https://github.com/distubejs/ytdl-core/issues/144.`
      );
      nTransformWarning = true;
    }

    if (nTransformFuncResult) {
      try {
        const scriptText = nTransformFuncResult.script + '\n' + nTransformFuncResult.nTransform;
        return new vm.Script(scriptText);
      } catch (err) {
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

exports.extractFunctions = body => {
  try {    
    const decipherResult = extractDecipher(body);
    const nTransformResult = extractNTransform(body, decipherResult);
      if (decipherResult) {
      try {
        const context = {};
        context[DECIPHER_ARGUMENT] = "testValue";
        decipherResult.runInNewContext(context);
      } catch (error) {
      }
    }
    
    if (nTransformResult) {
      try {
        const context = {};
        context[N_ARGUMENT] = "testValue";
        nTransformResult.runInNewContext(context);
      } catch (error) {
      }
    }    
    return [decipherResult, nTransformResult];
  } catch (error) {
    return [null, null];
  }
};

exports.setDownloadURL = (format, decipherScript, nTransformScript) => {
  if (!format) return;

  const decipher = url => {
    const args = querystring.parse(url);
    if (!args.s || !decipherScript) return args.url;

    try {
      
      const components = new URL(decodeURIComponent(args.url));
      const context = {};
      context[DECIPHER_ARGUMENT] = decodeURIComponent(args.s);
      const decipheredSig = decipherScript.runInNewContext({
        ...context,
        console: console
      });
      
      components.searchParams.set(args.sp || "sig", decipheredSig);
      return components.toString();
    } catch (err) {
      return args.url;
    }
  };

  const nTransform = url => {
    try {
      const components = new URL(decodeURIComponent(url));
      const n = components.searchParams.get("n");

      if (!n || !nTransformScript) return url;      
      const context = {};
      context[N_ARGUMENT] = n;
      const transformedN = nTransformScript.runInNewContext({
        ...context,
        console: console
      });
      
      if (transformedN) {
        if (n === transformedN) {
        } else if (transformedN.startsWith("enhanced_except_") || transformedN.endsWith("_w8_" + n)) {
        }

        components.searchParams.set("n", transformedN);
      } else {
      }

      return components.toString();
    } catch (err) {
      return url;
    }
  };

  const cipher = !format.url;
  const url = format.url || format.signatureCipher || format.cipher;

  if (!url) return;

  try {    
    format.url = nTransform(cipher ? decipher(url) : url);
    delete format.signatureCipher;
    delete format.cipher;
  } catch (err) {
  }
};

exports.decipherFormats = async (formats, html5player, options) => {
  try {
    const decipheredFormats = {};
    const [decipherScript, nTransformScript] = await exports.getFunctions(html5player, options);
    formats.forEach(format => {
        exports.setDownloadURL(format, decipherScript, nTransformScript);
        if (format.url) {
          decipheredFormats[format.url] = format;
        } 
    });
    return decipheredFormats;
  } catch (err) {
    return {};
  }
};
