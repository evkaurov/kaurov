/**
 * Font Collector 1.0
 * Scans the current After Effects project, finds every font used in text layers,
 * and saves a readable report for handoff.
 */
(function fontCollector() {
    if (!app || !app.project) {
        alert("Open a project before running Font Collector.");
        return;
    }

    var project = app.project;

    if (project.numItems === 0) {
        alert("The project is empty. Add compositions with text layers first.");
        return;
    }

    app.beginUndoGroup("Font Collector 1.0");

    var fonts = {};

    function addFont(fontName, compName) {
        var safeName = fontName || "Unknown font";
        if (!fonts[safeName]) {
            fonts[safeName] = { count: 0, comps: [] };
        }
        fonts[safeName].count += 1;
        if (fonts[safeName].comps.indexOf(compName) === -1) {
            fonts[safeName].comps.push(compName);
        }
    }

    function processTextLayer(layer, compName) {
        var textProp = layer.property("Source Text");
        if (!textProp) {
            return;
        }

        try {
            var textDocument = textProp.value;
            addFont(textDocument.font, compName);
        } catch (err) {
            // Skip layers that cannot return a TextDocument
        }
    }

    function processComp(comp) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer && layer.property && layer.property("Source Text")) {
                processTextLayer(layer, comp.name);
            }
        }
    }

    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            processComp(item);
        }
    }

    function getKeys(obj) {
        var list = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                list.push(key);
            }
        }
        return list;
    }

    var fontNames = getKeys(fonts).sort();

    if (fontNames.length === 0) {
        alert("No text layers with fonts were found in this project.");
        app.endUndoGroup();
        return;
    }

    var report = [];
    report.push("Font Collector 1.0");
    report.push("-----------------");
    report.push("Project: " + (project.file ? project.file.name : "Untitled project"));
    report.push("Generated: " + (new Date()).toString());
    report.push("");
    report.push("Fonts found: " + fontNames.length);
    report.push("");

    for (var f = 0; f < fontNames.length; f++) {
        var name = fontNames[f];
        var info = fonts[name];
        report.push((f + 1) + ". " + name + " — " + info.count + " layer(s)");

        if (info.comps.length) {
            report.push("   Comps: " + info.comps.join(", "));
        }

        report.push("");
    }

    var saveFile = File.saveDialog("Save Font Collector report", "Text file:*.txt");
    if (!saveFile) {
        app.endUndoGroup();
        return;
    }

    if (!/\.txt$/i.test(saveFile.name)) {
        saveFile = new File(saveFile.fsName + ".txt");
    }

    if (saveFile.exists) {
        saveFile.remove();
    }

    saveFile.encoding = "UTF-8";
    saveFile.lineFeed = "Unix";

    if (saveFile.open("w")) {
        for (var r = 0; r < report.length; r++) {
            saveFile.writeln(report[r]);
        }
        saveFile.close();
        alert("Font Collector finished.\nSaved report:\n" + saveFile.fsName);
    } else {
        alert("Unable to save the report file.");
    }

    app.endUndoGroup();
})();
