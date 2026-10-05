"""Builds two tiny sample SCORM packages (1.2 and 2004) with a 3-question quiz."""
import zipfile

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>__TITLE__</title>
<style>
  body{font:16px/1.55 system-ui,sans-serif;margin:0;padding:28px;color:#0b1f2e;background:#fff}
  h1{margin:0 0 6px;font-size:26px} .sub{color:#4a5d6c;margin:0 0 22px}
  .q{border:1px solid #dfe6ec;border-radius:10px;padding:14px 16px;margin:0 0 12px}
  .q p{margin:0 0 8px;font-weight:700} label{display:block;padding:4px 0;cursor:pointer}
  button{font:inherit;font-weight:700;padding:10px 20px;border:0;border-radius:8px;background:#0b1f2e;color:#fff;cursor:pointer}
  #result{margin-top:16px;font-weight:700} .tag{display:inline-block;font-size:12px;color:#4a5d6c;letter-spacing:.06em;text-transform:uppercase}
</style></head><body>
<span class="tag">Sample SCORM __VERSION__ package</span>
<h1>__TITLE__</h1>
<p class="sub">A short lesson and three questions. Your score goes to the learning platform.</p>
<p><strong>Key idea:</strong> __IDEA__</p>
<form id="quiz">
__QUESTIONS__
<button type="submit">Finish</button>
</form>
<div id="result" role="status"></div>
<script>
var A = null;
function find(name){ var w = window, n = 0; while (w && n++ < 10) { if (w[name]) return w[name]; if (w === w.parent) break; w = w.parent } return null }
var V2004 = "__VERSION__" === "2004";
A = find(V2004 ? "API_1484_11" : "API");
function call(fn){ return A ? A[fn].apply(A, Array.prototype.slice.call(arguments,1)) : null }
if (A) {
  if (V2004) { call("Initialize",""); if (call("GetValue","cmi.completion_status") !== "completed") call("SetValue","cmi.completion_status","incomplete"); }
  else { call("LMSInitialize",""); if (call("LMSGetValue","cmi.core.lesson_status") !== "completed" && call("LMSGetValue","cmi.core.lesson_status") !== "passed") call("LMSSetValue","cmi.core.lesson_status","incomplete"); }
}
document.getElementById("quiz").addEventListener("submit", function(e){
  e.preventDefault();
  var answers = __ANSWERS__, right = 0;
  for (var i = 0; i < answers.length; i++) { var c = document.querySelector('input[name="q'+i+'"]:checked'); if (c && c.value === answers[i]) right++ }
  var pct = Math.round(right / answers.length * 100);
  document.getElementById("result").textContent = "You scored " + pct + "% (" + right + " of " + answers.length + ").";
  if (A) {
    if (V2004) {
      call("SetValue","cmi.score.raw",String(pct)); call("SetValue","cmi.score.min","0"); call("SetValue","cmi.score.max","100");
      call("SetValue","cmi.score.scaled",String(pct/100));
      call("SetValue","cmi.completion_status","completed"); call("SetValue","cmi.success_status", pct >= 70 ? "passed" : "failed");
      call("Commit",""); call("Terminate","");
    } else {
      call("LMSSetValue","cmi.core.score.raw",String(pct)); call("LMSSetValue","cmi.core.score.min","0"); call("LMSSetValue","cmi.core.score.max","100");
      call("LMSSetValue","cmi.core.lesson_status", pct >= 70 ? "passed" : "completed");
      call("LMSCommit",""); call("LMSFinish","");
    }
  }
});
</script></body></html>
"""

def questions(items):
    out = []
    for i, (q, opts) in enumerate(items):
        rows = "".join(f'<label><input type="radio" name="q{i}" value="{chr(97+j)}"> {o}</label>' for j, o in enumerate(opts))
        out.append(f'<div class="q"><p>{i+1}. {q}</p>{rows}</div>')
    return "\n".join(out)

M12 = """<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="safe-lifting" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1">
    <organization identifier="org1"><title>Safe lifting basics</title>
      <item identifier="item1" identifierref="res1"><title>Safe lifting basics</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource>
  </resources>
</manifest>
"""
M2004 = """<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="forklift" version="1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3" xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3" xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="o1">
    <organization identifier="o1"><title>Forklift safety basics</title>
      <item identifier="i1" identifierref="r1"><title>Forklift safety basics</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormType="sco" href="index.html"><file href="index.html"/></resource>
  </resources>
</manifest>
"""

def build(path, manifest, title, version, idea, items, answers):
    page = (PAGE.replace("__TITLE__", title).replace("__VERSION__", version).replace("__IDEA__", idea)
            .replace("__QUESTIONS__", questions(items)).replace("__ANSWERS__", str(answers)))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("imsmanifest.xml", manifest)
        z.writestr("index.html", page)

build("safe-lifting-scorm12.zip", M12, "Safe lifting basics", "1.2",
      "Lift with your legs, keep the load close, and never twist while carrying.",
      [("Which posture is safest for lifting?", ["Bend at the waist", "Bend your knees, back straight", "Twist as you lift"]),
       ("How close should the load be?", ["As close to your body as you can", "At arm's length", "It does not matter"]),
       ("A load is too heavy. You should:", ["Try anyway", "Get help or use equipment", "Lift it quickly"])],
      ["b", "a", "b"])
build("forklift-basics-scorm2004.zip", M2004, "Forklift safety basics", "2004",
      "Inspect the forklift before every shift, keep forks low while moving, and never carry riders.",
      [("When should you inspect a forklift?", ["Before every shift", "Once a month", "Only after an accident"]),
       ("Where should the forks be while driving?", ["Raised high", "Low, just above the floor", "It does not matter"]),
       ("Can a coworker ride on the forks?", ["Yes, if short trips", "Never", "Only on weekends"])],
      ["a", "b", "b"])
print("built")
