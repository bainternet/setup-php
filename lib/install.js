"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec/lib/exec");
const path = __importStar(require("path"));
const httpm = __importStar(require("typed-rest-client/HttpClient"));
const fs = __importStar(require("fs"));
/*
Read the scripts
*/
let darwin = fs.readFileSync(path.join(__dirname, '../src/darwin.sh'), 'utf8');
let linux = fs.readFileSync(path.join(__dirname, '../src/linux.sh'), 'utf8');
let windows = fs.readFileSync(path.join(__dirname, '../src/windows.ps1'), 'utf8');
/*
Credit: https://github.com/Atinux
*/
function asyncForEach(array, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let index = 0; index < array.length; index++) {
            yield callback(array[index], index, array);
        }
    });
}
/*
Enable functions which are installed but not enabled
*/
function enableExtension(extension) {
    return __awaiter(this, void 0, void 0, function* () {
        windows += `try {
  $ext_dir = Get-PhpIniKey extension_dir
  $exist = Test-Path -Path $ext_dir\\php_${extension}.dll
  $enabled = php -r "if (in_array('${extension}', get_loaded_extensions())) {echo 'yes';} else {echo 'no';}"
  if($enabled -eq 'no' -and $exist) {
    Enable-PhpExtension ${extension} C:\\tools\\php$version
  }
} catch [Exception] {
  echo $_
}\n`;
        let shell_code = `ext_dir=$(php -i | grep "extension_dir" | sed -e "s|.*=>\s*||")
enabled=$(php -r "if (in_array('${extension}', get_loaded_extensions())) {echo 'yes';} else {echo 'no';}")
if [ "$enabled" == 'no' ] && [ test -f "$ext_dir/${extension}.so" ]; then
  echo "extension=${extension}.so" >> 'php -i | grep "Loaded Configuration" | sed -e "s|.*:\s*||"'
fi\n`;
        linux += shell_code;
        darwin += shell_code;
    });
}
/*
Install and enable extensions
*/
function addExtension(extension_csv, version) {
    return __awaiter(this, void 0, void 0, function* () {
        let extensions = extension_csv
            .split(',')
            .map(function (extension) {
            return extension
                .trim()
                .replace('php-', '')
                .replace('php_', '');
        });
        linux += '\n';
        windows += '\n';
        darwin += '\n';
        yield asyncForEach(extensions, function (extension) {
            return __awaiter(this, void 0, void 0, function* () {
                enableExtension(extension);
                linux +=
                    'sudo apt install -y php' +
                        version +
                        '-' +
                        extension +
                        ' || echo "Couldn\'t find extension php' +
                        version +
                        '-' +
                        extension +
                        '"\n';
                const http = new httpm.HttpClient('shivammathur/php-setup', [], {
                    allowRetries: true,
                    maxRetries: 2
                });
                const response = yield http.get('https://pecl.php.net/package/' + extension);
                if (response.message.statusCode == 200) {
                    windows +=
                        'try { Install-PhpExtension ' +
                            extension +
                            ' } catch [Exception] { echo $_; echo "Could not install extension: "' +
                            extension +
                            ' }\n';
                    darwin +=
                        'pecl install ' +
                            extension +
                            ' || echo "Couldn\'t find extension: ' +
                            extension +
                            '"\n';
                }
                else {
                    console.log('Cannot find pecl extension: ' + extension);
                }
            });
        });
        linux += 'sudo apt autoremove -y';
    });
}
/*
Write final script which runs
*/
function createScript(filename, version) {
    return __awaiter(this, void 0, void 0, function* () {
        let script = '';
        if (filename == 'linux.sh') {
            script = linux;
        }
        else if (filename == 'darwin.sh') {
            script = darwin;
        }
        else if (filename == 'windows.ps1') {
            script = windows;
        }
        fs.writeFile(version + filename, script, function (error) {
            if (error) {
                return console.log(error);
            }
            console.log('The file was saved!');
        });
    });
}
/*
Run the script
*/
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let version = process.env['php-version'];
            if (!version) {
                version = core.getInput('php-version', { required: true });
            }
            console.log('Input: ' + version);
            let extension_csv = process.env['extension-csv'];
            if (!extension_csv) {
                extension_csv = core.getInput('extension-csv');
            }
            if (extension_csv) {
                console.log('Input: ' + extension_csv);
                yield addExtension(extension_csv, version);
            }
            let os_version = process.platform;
            if (os_version == 'darwin') {
                yield createScript('darwin.sh', version);
                yield exec_1.exec('sudo chmod a+x ' + version + 'darwin.sh');
                yield exec_1.exec('sh -x ./' + version + 'darwin.sh ' + version);
            }
            else if (os_version == 'win32') {
                yield createScript('windows.ps1', version);
                yield exec_1.exec('powershell .\\' + version + 'windows.ps1 -version ' + version);
            }
            else if (os_version == 'linux') {
                yield createScript('linux.sh', version);
                yield exec_1.exec('sudo chmod a+x ' + version + 'linux.sh');
                yield exec_1.exec('./' + version + 'linux.sh ' + version);
            }
        }
        catch (err) {
            core.setFailed(err.message);
        }
    });
}
// call the run function
run().then(function () {
    console.log('done');
});
