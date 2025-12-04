// Font Collector 1.0 by Eugene Kaurov (kaurov.net)

(function () {
  var isAE = false;
  var isPS = false;
  var isAI = false;
  var appNameStr = "";

  if (typeof app.project !== "undefined") {
      isAE = true;
      appNameStr = "Adobe After Effects";
  }
  else if (typeof app.documents !== "undefined") {
      var appNm = String(app.name);
      if (appNm.indexOf("Photoshop") >= 0) {
          isPS = true;
          appNameStr = "Adobe Photoshop";
      } else if (appNm.indexOf("Illustrator") >= 0) {
          isAI = true;
          appNameStr = "Adobe Illustrator";
      }
  }

  var currentDocPath = null;
  var currentDocName = "";

  if (isAE) {
    if (!app.project || !app.project.file) {
      alert("Please save the project (.aep) so the script knows where to save the fonts.");
      return;
    }
    currentDocPath = app.project.file.parent;
    currentDocName = app.project.file.name;
  } 
  else if (isPS) {
    if (app.documents.length === 0) {
      alert("No open documents.");
      return;
    }
    try {
      currentDocPath = app.activeDocument.path;
      currentDocName = app.activeDocument.name;
    } catch (e) {
      alert("Please save the file (.psd) so the script knows where to save the fonts.");
      return;
    }
  } 
  else if (isAI) {
    if (app.documents.length === 0) {
      alert("No open documents.");
      return;
    }
    try {
      var f = app.activeDocument.fullName;
      currentDocPath = f.parent;
      currentDocName = f.name;
    } catch (e) {
      alert("Please save the file (.ai) so the script knows where to save the fonts.");
      return;
    }
  }
  else {
    alert("Could not detect the application.\nPlease run in After Effects, Photoshop or Illustrator.");
    return;
  }

  function toLower(s) { return (s || "").toLowerCase(); }

  function getFormattedDate() {
    var d = new Date();
    var dd = ("0" + d.getDate()).slice(-2);
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    var yyyy = d.getFullYear();
    var h = ("0" + d.getHours()).slice(-2);
    var min = ("0" + d.getMinutes()).slice(-2);
    var s = ("0" + d.getSeconds()).slice(-2);
    return dd + "." + mm + "." + yyyy + " " + h + ":" + min + ":" + s;
  }

  function isFontFileSignature(file) {
    try {
      file.encoding = "BINARY";
      if (!file.open("r")) return false;
      var header = file.read(4);
      file.close();
      if (!header || header.length < 4) return false;
      var hex = "";
      for (var i = 0; i < 4; i++) {
        var h = header.charCodeAt(i).toString(16);
        if (h.length < 2) h = "0" + h;
        hex += h;
      }
      hex = hex.toLowerCase();
      return (hex === "4f54544f" || hex === "00010000" || hex === "74746366");
    } catch (e) {}
    return false;
  }

  function ensureFolder(folder) {
    if (!folder.exists) folder.create();
    return folder;
  }

  function listFontsAE() {
    var fonts = {};
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (!(item instanceof CompItem)) continue;
      for (var l = 1; l <= item.numLayers; l++) {
        var lyr = item.layer(l);
        if (!lyr.property || !lyr.property("Source Text")) continue;
        try {
          var td = lyr.property("Source Text").value;
          if (td && td.font) fonts[td.font] = true;
        } catch (e) {}
      }
    }
    var arr = [];
    for (var k in fonts) if (fonts.hasOwnProperty(k)) arr.push(k);
    return arr;
  }

  function getFontsFromActiveLayerAM() {
    var foundFonts = [];
    try {
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        var desc = executeActionGet(ref);
        var textKey = desc.getObjectValue(stringIDToTypeID("textKey"));
        var ranges = textKey.getList(stringIDToTypeID("textStyleRange"));
        for (var i = 0; i < ranges.count; i++) {
            var range = ranges.getObjectValue(i);
            var style = range.getObjectValue(stringIDToTypeID("textStyle"));
            var fontName = style.getString(stringIDToTypeID("fontPostScriptName"));
            if (fontName) foundFonts.push(fontName);
        }
    } catch(e) {
        try { foundFonts.push(app.activeDocument.activeLayer.textItem.font); } catch(err){}
    }
    return foundFonts;
  }

  function listFontsPS() {
    var fonts = {};
    var doc = app.activeDocument;
    var originalActiveLayer = doc.activeLayer;

    function scanLayers(layerNode) {
        for (var i = 0; i < layerNode.length; i++) {
            var layer = layerNode[i];
            if (layer.typename == "LayerSet") {
                scanLayers(layer.layers);
            } 
            else if (layer.kind == LayerKind.TEXT) {
                try {
                    doc.activeLayer = layer;
                    var layerFonts = getFontsFromActiveLayerAM();
                    for (var f = 0; f < layerFonts.length; f++) {
                        fonts[layerFonts[f]] = true;
                    }
                } catch(e) {}
            }
        }
    }
    scanLayers(doc.layers);
    try { doc.activeLayer = originalActiveLayer; } catch(e){}
    
    var arr = [];
    for (var k in fonts) if (fonts.hasOwnProperty(k)) arr.push(k);
    return arr;
  }

  function listFontsAI() {
    var fonts = {};
    var doc = app.activeDocument;
    var tfs = doc.textFrames;
    for (var i = 0; i < tfs.length; i++) {
        var tf = tfs[i];
        try {
            var ranges = tf.textRanges;
            for (var r = 0; r < ranges.length; r++) {
                try {
                    var attr = ranges[r].characterAttributes;
                    if (attr && attr.textFont && attr.textFont.name) {
                        fonts[attr.textFont.name] = true;
                    }
                } catch(innerE) {}
            }
        } catch(e) {
             try {
                if (tf.textRange.characterAttributes.textFont.name) {
                     fonts[tf.textRange.characterAttributes.textFont.name] = true;
                }
             } catch(e2) {}
        }
    }
    var arr = [];
    for (var k in fonts) if (fonts.hasOwnProperty(k)) arr.push(k);
    return arr;
  }

  function getFontSearchRoots() {
    var roots = [];
    var isWin = toLower($.os).indexOf("windows") >= 0;
    var isMac = toLower($.os).indexOf("mac") >= 0;
    
    if (isWin) {
      roots.push(new Folder("C:/Windows/Fonts"));
      roots.push(new Folder("C:/Users/Public/Fonts"));
      
      var appData = Folder.userData; 
      var localAppData = new Folder(Folder.userData.parent.fsName + "/Local");
      
      roots.push(new Folder(localAppData.fsName + "/Microsoft/Windows/Fonts"));
      roots.push(new Folder("C:/Program Files/Common Files/Adobe/Fonts"));
      roots.push(new Folder("C:/Program Files/Adobe/Fonts"));
      roots.push(new Folder(Folder.userData.fsName + "/Adobe/CoreSync/plugins/livetype"));
      roots.push(new Folder(Folder.userData.fsName + "/Adobe/CoreSync/plugins/livetype/.r")); 
      roots.push(new Folder(Folder.userData.fsName + "/Adobe/Fonts"));
      roots.push(new Folder(localAppData.fsName + "/Adobe/Fonts"));
    } else {
      var home = Folder("~").fsName;
      roots.push(new Folder("/Library/Fonts"));
      roots.push(new Folder("/System/Library/Fonts"));
      roots.push(new Folder(home + "/Library/Fonts"));
      roots.push(new Folder("/Library/Application Support/Adobe/Fonts"));
      roots.push(new Folder(home + "/Library/Application Support/Adobe/CoreSync/plugins/livetype"));
      roots.push(new Folder(home + "/Library/Application Support/Adobe/CoreSync/plugins/livetype/.r"));
    }
    
    try {
        var installRoot = null;
        if (isWin) {
            installRoot = new Folder("C:/Program Files/Adobe");
        } else if (isMac) {
            installRoot = new Folder("/Applications");
        }

        if (installRoot && installRoot.exists) {
            var adobeApps = installRoot.getFiles(); 
            for (var i = 0; i < adobeApps.length; i++) {
                var appFolder = adobeApps[i];
                if (!(appFolder instanceof Folder)) continue;
                
                var folderName = decodeURI(appFolder.name);
                if (folderName.indexOf("Adobe Photoshop") !== -1 || folderName.indexOf("Adobe Illustrator") !== -1) {
                    var searchBase = appFolder;
                    
                    if (isMac) {
                        var macApps = appFolder.getFiles("*.app");
                        if (macApps.length > 0) {
                            searchBase = macApps[0]; 
                        }
                    }

                    var internalPaths = [
                        "Required/Fonts",
                        "Required/PDFL/Resource/Fonts", 
                        "Support Files/Required/PDFL Resource/Resource/Fonts", 
                        "Support Files/Required/Fonts",
                        "Resources/Fonts",
                        
                        "Contents/Required/PDFL/Resource/Fonts", 
                        "Contents/Resources/Fonts",
                        "Contents/Resources/ui-fonts", 
                        "Contents/Required/Fonts",
                        "Contents/Frameworks"
                    ];

                    for (var p = 0; p < internalPaths.length; p++) {
                        var tryPath = new Folder(searchBase.fsName + "/" + internalPaths[p]);
                        if (tryPath.exists) {
                            roots.push(tryPath);
                        }
                    }
                }
            }
        }
    } catch(e) {}

    var existing = [];
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].exists) {
          existing.push(roots[i]);
      }
    }
    return existing;
  }

  function listFontFiles(root, depth, maxDepth, acc) {
    acc = acc || [];
    if (depth > maxDepth) return acc;
    var entries = root.getFiles();
    if (!entries) return acc;
    for (var i = 0; i < entries.length; i++) {
      var f = entries[i];
      if (f instanceof Folder) {
        if (f.name.indexOf(".") !== 0 || f.name === ".r") { 
            listFontFiles(f, depth + 1, maxDepth, acc);
        }
      } else if (f instanceof File) {
        if (f.name.indexOf("._") === 0 || f.name.indexOf(".DS_Store") === 0) continue;

        var nm = toLower(decodeURI(f.displayName || f.name || ""));
        var isStandardExt = /\.(otf|ttf|ttc|otc|dfont)$/i.test(nm);
        
        if (isStandardExt) {
            acc.push(f);
        } else {
            var path = toLower(f.fsName);
            if ((path.indexOf("adobe") >= 0 || path.indexOf("coresync") >= 0) && f.length > 0) {
                 if (isFontFileSignature(f)) acc.push(f);
            }
        }
      }
    }
    return acc;
  }

  function readU16(s, off) {
    if (off + 2 > s.length) return 0;
    return (s.charCodeAt(off) << 8) + s.charCodeAt(off + 1);
  }
  function readU32(s, off) {
    if (off + 4 > s.length) return 0;
    return (s.charCodeAt(off) << 24) + (s.charCodeAt(off + 1) << 16) + (s.charCodeAt(off + 2) << 8) + s.charCodeAt(off + 3);
  }
  function decodeUtf16BE(str) {
    var out = "";
    for (var i = 0; i + 1 < str.length; i += 2) {
      var code = (str.charCodeAt(i) << 8) + str.charCodeAt(i + 1);
      if (code) out += String.fromCharCode(code);
    }
    return out;
  }

  function parseFontNames(file) {
    var names = [];
    try {
      file.encoding = "BINARY";
      if (!file.open("r")) return names;
      var header = file.read(12);
      if (!header || header.length < 12) { file.close(); return names; }
      
      var numTables = readU16(header, 4);
      if (numTables > 100) numTables = 100;
      var tables = file.read(numTables * 16);
      if (!tables) { file.close(); return names; }

      var nameOffset = null, nameLength = null;
      for (var t = 0; t < numTables; t++) {
        var base = t * 16;
        if (base + 16 > tables.length) break;
        var tag = tables.substr(base, 4);
        if (tag === "name") {
          nameOffset = readU32(tables, base + 8);
          nameLength = readU32(tables, base + 12);
          break;
        }
      }
      if (nameOffset === null || nameLength === null) { file.close(); return names; }
      
      file.seek(nameOffset);
      var data = file.read(nameLength);
      file.close();
      if (!data || data.length < 6) return names;

      var count = readU16(data, 2);
      var stringOffset = readU16(data, 4);
      
      for (var i = 0; i < count; i++) {
        var recBase = 6 + i * 12;
        if (recBase + 12 > data.length) break;
        var nameID = readU16(data, recBase + 6);
        
        if (nameID !== 1 && nameID !== 4 && nameID !== 6 && nameID !== 16) continue; 
        
        var length = readU16(data, recBase + 8);
        var offset = readU16(data, recBase + 10);
        var start = stringOffset + offset;
        if (start + length > data.length) continue;
        
        var raw = data.substr(start, length);
        var platformID = readU16(data, recBase + 0);
        var encodingID = readU16(data, recBase + 2);
        var decoded = "";
        
        if (platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10))) {
          decoded = decodeUtf16BE(raw);
        } else if (platformID === 1 && encodingID === 0) {
           decoded = raw; 
        } else {
           decoded = raw.replace(/\u0000/g, "");
        }
        
        if (decoded && decoded.length > 1) {
             names.push(decoded);
        }
      }
    } catch (e) { 
        try { file.close(); } catch (e2) {} 
    }
    return names;
  }
  
  function getInternalFontName(file) {
      var psName = null;
      var fullName = null;
      var familyName = null;
      
      var names = parseFontNames(file); 
      for (var i=0; i<names.length; i++) {
          var n = names[i];
          if (n.indexOf(" ") === -1 && n.length > 3) psName = n;
          if (n.indexOf(" ") > -1 && n.length > 3) fullName = n;
      }
      return psName || fullName || names[0] || null;
  }

  function normalizeFontName(name) {
    return toLower(decodeURI(name)).replace(/[\s_\-,.]+/g, "");
  }

  function getFontFamilyStub(name) {
      var n = normalizeFontName(name);

      var varIdx = n.indexOf("variable");
      if (varIdx > 0) {
          return n.substring(0, varIdx);
      }
      
      if (n.indexOf("-") > -1) {
          return n.split("-")[0];
      }
      
      var commonStyles = [
          "regular", "bold", "italic", "medium", "light", "black", "thin", 
          "heavy", "book", "roman", "condensed", "narrow", "oblique", 
          "semibold", "extrabold", "extralight", "variable", "concept", 
          "display", "caption", "text", "subhead", "deck", "poster", "solid"
      ];
      commonStyles.sort(function(a, b){ return b.length - a.length; });

      var cleanName = n;
      for (var i = 0; i < commonStyles.length; i++) {
          var style = commonStyles[i];
          if (cleanName.length > style.length && cleanName.lastIndexOf(style) === (cleanName.length - style.length)) {
              cleanName = cleanName.substring(0, cleanName.length - style.length);
              i = -1; 
          }
      }
      return cleanName.length > 2 ? cleanName : n;
  }

  function findFontFilesAndSiblings(fontName, searchFiles) {
    var familyStub = getFontFamilyStub(fontName);
    var normalizedTarget = normalizeFontName(fontName);
    
    var found = [];
    
    if (familyStub.length < 3) familyStub = normalizedTarget;

    for (var k = 0; k < searchFiles.length; k++) {
      var tf = searchFiles[k];
      var srcName = decodeURI(tf.displayName || tf.name || "");
      var dotIndex = srcName.lastIndexOf(".");
      var nameNoExt = (dotIndex > 0) ? srcName.substring(0, dotIndex) : srcName;
      var fileNmNormalized = normalizeFontName(nameNoExt);
      
      if (fileNmNormalized.indexOf(familyStub) === 0) {
          found.push(tf);
          continue; 
      }

      var internalNames = parseFontNames(tf);
      var isInternalMatch = false;

      for (var n = 0; n < internalNames.length; n++) {
        var rawName = internalNames[n];
        var nm2 = normalizeFontName(rawName);
        
        if (nm2 === normalizedTarget) {
            isInternalMatch = true;
            break;
        }

        if (nm2.indexOf(familyStub) === 0) {
            isInternalMatch = true;
            break;
        }
      }

      if (isInternalMatch) {
          found.push(tf);
      }
    }

    var uniq = [];
    var seen = {};
    for (var k2 = 0; k2 < found.length; k2++) {
      var f = found[k2];
      var key = toLower(decodeURI(f.name)) + "_" + f.length; 
      if (!seen[key]) {
        uniq.push(f);
        seen[key] = true;
      }
    }
    return uniq;
  }

  var fonts = [];
  if (isAE) {
      fonts = listFontsAE();
  } else if (isPS) {
      fonts = listFontsPS();
  } else if (isAI) {
      fonts = listFontsAI();
  }

  if (fonts.length === 0) {
    alert("No text found in the document.");
    return;
  }

  var docBaseName = currentDocName;
  var lastDot = docBaseName.lastIndexOf(".");
  if (lastDot > 0) docBaseName = docBaseName.substring(0, lastDot);
  docBaseName = docBaseName.replace(/[\/\\\:\*\?\"\<\>\|]/g, "_");

  var destFolder = ensureFolder(new Folder(currentDocPath.fsName + "/Collected_Fonts_" + docBaseName));
  var logFile = new File(destFolder.fsName + "/fonts_report.txt");
  
  var w, uiLabel;
  if (typeof Window !== "undefined") {
      w = new Window("palette", "Font Collector");
      w.orientation = "column";
      uiLabel = w.add("statictext", undefined, "Initializing...", {truncate: "middle"});
      uiLabel.preferredSize.width = 300; 
      w.layout.layout(true);
      w.center();
      w.show();
      w.update();
  }

  function updateUI(text) {
      if (w && uiLabel) {
          uiLabel.text = text;
          w.update();
      }
  }

  updateUI("Scanning system fonts...");
  var roots = getFontSearchRoots();
  var searchFiles = [];
  for (var r = 0; r < roots.length; r++) {
    updateUI("Scanning: " + roots[r].displayName);
    listFontFiles(roots[r], 0, 8, searchFiles);
  }

  var copied = 0;
  var copiedListNames = []; 
  var reportLines = []; 
  var missingCount = 0;

  for (var iFont = 0; iFont < fonts.length; iFont++) {
    var fName = fonts[iFont];
    updateUI("Processing Family: " + fName);
    var foundList = findFontFilesAndSiblings(fName, searchFiles);
    
    if (foundList && foundList.length > 0) {
      for (var fi = 0; fi < foundList.length; fi++) {
        var found = foundList[fi];
        
        var realName = getInternalFontName(found);
        var finalName = realName ? realName : fName;
        finalName = finalName.replace(/[\/\\\:\*\?\"\<\>\|]/g, "").replace(/^\s+|\s+$/g, '');

        var srcName = decodeURI(found.displayName || found.name);
        var dot = srcName.lastIndexOf(".");
        var ext = (dot > 0) ? srcName.substring(dot) : ".otf";
        
        if (!realName) {
            finalName = srcName.substring(0, dot > 0 ? dot : srcName.length);
        }

        var targetFile = new File(destFolder.fsName + "/" + finalName + ext);
        
        if (targetFile.exists) {
            continue; 
        }
        
        try {
            found.copy(targetFile.fsName);
            copied++;
            copiedListNames.push(finalName);
            
            reportLines.push("[OK] Match for '" + fName + "': " + 
                     "\n      -> File: " + decodeURI(found.name) +
                     "\n      -> Saved as: " + decodeURI(targetFile.name));
        } catch(copyErr) {
            reportLines.push("[ERROR] Found but failed to copy: " + fName);
        }
      }
    } else {
      reportLines.push("[FAIL] " + fName + " (and siblings) - not found in system.");
      missingCount++;
    }
  }

  updateUI("Writing report...");

  try {
    logFile.encoding = "UTF-8";
    var currentDate = getFormattedDate();
    var contentToWrite = "";
    var creditsText = "The font files were collected using the free Font Collector 1.0 script by Eugene Kaurov www.kaurov.net\n";
    var noticeText = "------------------------------------------------\n" +
                     "Information Notice.\n" +
                     "Font Collector has gathered the font files used in this project to support reliable reopening of your archived work in the future.\n" +
                     "This script is intended for personal use only and should not be used to share or distribute font files to third parties.\n" +
                     "Font software is protected by copyright. Please ensure that your use, storage, or handling of copied fonts complies with the licensing terms associated with them. The author is not responsible for any licensing violations or legal issues arising from the user's actions.\n" +
                     "------------------------------------------------\n";
    
    var systemStr = ($.os.toLowerCase().indexOf("windows") !== -1) ? "Windows" : "MacOS";

    if (logFile.exists) {
        logFile.open("e");
        logFile.seek(0, 2);
        
        contentToWrite += "\n\n";
        contentToWrite += "=== REPORT UPDATE: " + currentDate + " ===\n";
        contentToWrite += "------------------------------------------------\n";
        contentToWrite += reportLines.join("\n") + "\n";
        
        logFile.write(contentToWrite);
        logFile.close();
    } 
    else {
        logFile.open("w");
        contentToWrite += creditsText;
        contentToWrite += noticeText;
        contentToWrite += "Program: " + appNameStr + "\n";
        contentToWrite += "System: " + systemStr + "\n";
        contentToWrite += "File: " + currentDocName + "\n";
        contentToWrite += "Date created: " + currentDate + "\n";
        contentToWrite += "------------------------------------------------\n";
        
        if (reportLines.length > 0) {
            contentToWrite += reportLines.join("\n") + "\n";
        } else {
             contentToWrite += "(Fonts found in project, but list is empty)\n";
        }

        logFile.write(contentToWrite);
        logFile.close();
    }

  } catch (logErr) {}

  if (w) w.close();

  var resWindow = new Window("dialog", "Script Finished");
  resWindow.orientation = "column";
  resWindow.alignChildren = ["fill", "top"];
  resWindow.spacing = 15;
  resWindow.margins = 20;

  var msgText = "Done!\nTotal font files copied: " + copied;

  if (missingCount > 0) {
      msgText += "\n\n[!] Missing fonts: " + missingCount;
  }

  if (copied === 0 && missingCount === 0) {
      msgText += "\n(All fonts were already in the folder)";
  }

  msgText += "\n\nSee report in the folder for full list";

  var staticTxt = resWindow.add("statictext", undefined, msgText, {multiline: true});
  staticTxt.preferredSize.width = 300;
  staticTxt.maximumSize.height = 300; 
  staticTxt.alignment = ["center", "top"];

  var footerGroup = resWindow.add("group");
  footerGroup.orientation = "row";
  footerGroup.alignment = ["fill", "top"];
  footerGroup.margins = 0;

  var btnGroup = footerGroup.add("group");
  btnGroup.orientation = "row";
  btnGroup.alignment = ["left", "center"];
  btnGroup.spacing = 15;

  var openFolderBtn = btnGroup.add("button", undefined, "Open Folder");
  openFolderBtn.onClick = function() {
      if ($.os.indexOf("Windows") != -1) {
          destFolder.execute(); 
      } else {
          system.callSystem("open \"" + destFolder.fsName + "\"");
      }
  };
  
  var closeBtn = btnGroup.add("button", undefined, "OK");
  closeBtn.onClick = function() {
      resWindow.close();
  };

  var spacer = footerGroup.add("group");
  spacer.alignment = ["fill", "fill"];

  var linkStack = footerGroup.add("group");
  linkStack.orientation = "stack";
  linkStack.alignment = ["right", "center"];
  linkStack.margins = 0;

  var linkNormal = linkStack.add("statictext", undefined, "Info");
  var linkHover = linkStack.add("statictext", undefined, "Info");
  linkHover.visible = false;

  try {
      if (linkHover.graphics) {
          var gfx = linkHover.graphics;
          var pen = gfx.newPen(gfx.PenType.SOLID_COLOR, [1, 1, 1], 1);
          gfx.foregroundColor = pen;
      }
  } catch(e){}

  function showInfoDialog() {
      var infoWin = new Window("dialog", "About Font Collector");
      infoWin.orientation = "column";
      infoWin.alignChildren = ["fill", "top"];
      infoWin.spacing = 10;
      infoWin.margins = 20;

      var infoText = "About Font Collector 1.0\n\n" +
                     "Font Collector is intended solely for personal archiving of your own projects in After Effects, Photoshop, and Illustrator.\n" +
                     "The script copies the font files detected in your system into a folder next to your project, helping you reopen archived work in the future without missing fonts or manual searching.\n\n" +
                     "Important\n\n" +
                     "- The script is not intended for sharing, transferring, or distributing font files to third parties.\n" +
                     "- Most fonts, including Adobe Fonts and commercial typefaces, are protected by copyright and may have licensing restrictions on copying or redistribution.\n" +
                     "- You are responsible for ensuring that your use and storage of copied font files complies with the licensing terms of those fonts.\n\n" +
                     "This tool is provided \"as is.\" The author is not liable for any legal outcomes or licensing violations resulting from the use of this script.";

      var infoStatic = infoWin.add("statictext", undefined, infoText, {multiline: true});
      infoStatic.preferredSize.width = 400; 
      
      var closeInfoBtn = infoWin.add("button", undefined, "Close");
      closeInfoBtn.alignment = ["center", "bottom"];
      closeInfoBtn.onClick = function() {
          infoWin.close();
      };

      infoWin.center();
      infoWin.show();
  }

  linkNormal.addEventListener('mouseover', function() {
      linkNormal.visible = false;
      linkHover.visible = true;
  });

  linkHover.addEventListener('mouseout', function() {
      linkHover.visible = false;
      linkNormal.visible = true;
  });
  
  var clickHandler = function() { showInfoDialog(); };
  
  linkNormal.addEventListener('mousedown', clickHandler);
  linkHover.addEventListener('mousedown', clickHandler);

  resWindow.show();

})();