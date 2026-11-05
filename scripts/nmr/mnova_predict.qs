// MestReNova batch for head_to_head.py: 13C and 1H prediction for every structure in a .smi file.
// Open Tools > Edit Script, load this file, add a last line mnovaPredict(); and run it.
// Set DIR to the folder holding IN.smi (one "SMILES ID" per line); writes mnova.jsonl beside it.
var DIR = "C:/path/to/folder/";
function mnovaPredict() {
  var fin = new File(DIR + "in.smi");
  if (!fin.open(File.ReadOnly)) { print("cannot read in.smi"); return; }
  var tin = new TextStream(fin), L = [];
  while (!tin.atEnd()) { var s = tin.readLine(); if (s && s.length > 3) { var k = s.lastIndexOf(" "); L.push([s.substring(k + 1), s.substring(0, k)]); } }
  fin.close();
  var fout = new File(DIR + "mnova.jsonl");
  fout.open(File.WriteOnly);
  var tout = new TextStream(fout);
  var doc = mainWindow.newDocument(), t0 = new Date();
  for (var i = 0; i < L.length; i++) {
    var rec = {id: L[i][0], "13C": [], "1H": []};
    try {
      molecule.importSMILES(L[i][1]);
      var mol = molecule.activeMolecule();
      var a = NMRPredictor.predict(mol, "13C");
      var b = NMRPredictor.predict(mol, "1H");
      var p = mol.nmrPrediction("13C");
      for (var k in p) { var e = p[k]; if (e && e.atom && e.shift && e.shift.value > -1000) rec["13C"].push(Math.round(e.shift.value * 100) / 100); }
      p = mol.nmrPrediction("1H");
      for (var k2 in p) { var e2 = p[k2]; if (e2 && e2.atom && e2.shift && e2.shift.value > -1000) rec["1H"].push([Math.round(e2.shift.value * 1000) / 1000, 1]); }
      try { doc.getItem(a).remove(); } catch (x) {}
      try { doc.getItem(b).remove(); } catch (x) {}
      try { mol.remove(); } catch (x) {}
    } catch (err) { rec.error = String(err); }
    tout.write(JSON.stringify(rec) + "\n");
    if (i % 25 == 24) { print((i + 1) + " done, " + Math.round((new Date() - t0) / 1000) + " s"); mainWindow.processEvents(); }
  }
  fout.close();
  print("saved mnova.jsonl, " + L.length + " compounds");
}
