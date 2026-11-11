import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: ".tools/vite-test-cache", logLevel: "silent", appType: "custom", resolve: { preserveSymlinks: true }, server: { middlewareMode: true } });
try {
  const { EMPLOYEES, isWorkEmail, employeeSignupData } = await server.ssrLoadModule("/src/foundation/library/employeeSignup.js");
  assert.deepEqual(EMPLOYEES.map((employee) => employee.name), ["Hector Reyes", "Don Baggio", "Steve Martin", "Scott Martin", "Chuck Atkinson", "Randy Guenther", "Eric O'Neil"]);
  assert.equal(new Set(EMPLOYEES.map((employee) => employee.id)).size, 7);
  assert.equal(isWorkEmail(" HECTOR@CONCRETEWS.COM "), true);
  for (const address of ["hector@gmail.com", "hector@concretews.com.attacker.test", "hector@other@concretews.com", "hector@notconcretews.com"]) {
    assert.equal(isWorkEmail(address), false);
    assert.throws(() => employeeSignupData(address, "hector-reyes"), /work email/);
  }
  assert.deepEqual(employeeSignupData("hector@concretews.com", "hector-reyes"), { employee_id: "hector-reyes" });
  assert.throws(() => employeeSignupData("hector@concretews.com", "admin"), /employee list/);
  const { readAuthProviders, socialSignInRequest } = await server.ssrLoadModule("/src/foundation/library/socialAuth.js");
  assert.equal(socialSignInRequest("google", "https://take0ff.netlify.app/index.html").provider, "google");
  assert.throws(() => socialSignInRequest("unknown", "https://take0ff.netlify.app/index.html"));
  assert.equal(socialSignInRequest("google", "https://foundationtakeoff.com/index.html").options.redirectTo, "https://foundationtakeoff.com/index.html");
  assert.equal(socialSignInRequest("google", "https://foundationtakeoff.com/index.html").options.scopes, "openid email profile");
  assert.deepEqual(await readAuthProviders("https://example.invalid", "public-test-key", async () => ({ ok: true, json: async () => ({ external: { google: false } }) })), { google: false });
  await assert.rejects(readAuthProviders("https://example.invalid", "public-test-key", async () => ({ ok: false })), /could not be loaded/);
  const { authReturnNotice, authReturnUrl } = await server.ssrLoadModule("/src/foundation/library/authReturn.js");
  const expired = authReturnNotice("http://127.0.0.1:4176/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=");
  assert.equal(expired.kind, "warning");
  assert.match(expired.message, /already been used/);
  assert.match(authReturnNotice("http://127.0.0.1:4176/#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email&sb=").message, /other inbox/);
  assert.equal(authReturnNotice("http://127.0.0.1:4176/#access_token=private-value&refresh_token=another-private-value&type=email_change"), null, "tokens are never reflected in a notice");
  assert.equal(authReturnUrl(new URL("http://127.0.0.1:4176/")), "http://127.0.0.1:4176/index.html");
  const { cleanDetails, drawingPayload, readDocument, groupDrawings, drawingTitle } = await server.ssrLoadModule("/src/foundation/library/documents.js");
  const { EMPTY_DOC, reserveEntityIds, nid } = await server.ssrLoadModule("/src/foundation/model.js");
  const details = cleanDetails({ customer_name: " Builder ", project_name: " Shared Project ", city: " Naperville ", estimator_name: " Jake ", print_revision: " Rev 2 ", job_type: "tract" });
  assert.equal(details.project_name, "Shared Project");
  assert.equal(details.city, "Naperville");
  assert.equal(details.estimator_name, "Jake");
  assert.throws(() => cleanDetails({ ...details, print_revision: "  " }), /print date/);
  const variants = [
    { ...details, id: "a", model_name: "Aspen", elevation: "A" },
    { ...details, id: "b", model_name: "Aspen", elevation: "B" },
    { ...details, id: "c", model_name: "Willow", elevation: "A", city: "Aurora", estimator_name: "Casey" },
    { ...details, id: "d", model_name: "Aspen", elevation: "A", print_revision: "Rev 1" },
    { ...details, customer_name: "Other Customer", id: "e", model_name: "", elevation: "", job_type: "custom" },
  ];
  const grouped = groupDrawings(variants);
  assert.equal(grouped.length, 2, "same project name for different customers stays separate");
  assert.equal(grouped[0].drawings.length, 4, "tract models, elevations, and revisions remain separate drawings within a project");
  assert.equal(groupDrawings(variants, "willow", "tract")[0].drawings[0].id, "c");
  assert.equal(groupDrawings(variants, "aurora")[0].drawings[0].id, "c", "city is searchable without merging drawing variants");
  assert.equal(groupDrawings(variants, "casey")[0].drawings[0].id, "c", "estimator name is searchable");
  assert.equal(groupDrawings(variants, "", "custom")[0].drawings.length, 1);
  assert.equal(drawingTitle(variants[0]), "Aspen · Elevation A");
  const doc = { ...EMPTY_DOC, walls: [{ id: 5500, x1: 0, y1: 0, x2: 15, y2: 0, thickness: 10, depth: 8, footing: { w: 24, h: 10 }, lengthBasis: "outside", traceSide: 1, faceStart: { x: 0, y: 0 }, faceEnd: { x: 15, y: 0 } }], drains: [{ id: 5501, kind: "exterior", pts: [{ x: 0, y: 0, anchor: { wallId: 5500, corner: 0 } }] }], texts: [{ id: 5502, x: 0, y: 0, text: "Field note", size: 6, color: "#ff0000" }] };
  const payload = drawingPayload(doc, { "wall-color|10|8": "#ddaa44" });
  const reopened = readDocument(JSON.parse(JSON.stringify(payload.document)));
  assert.deepEqual(reopened.walls, doc.walls, "face dimensions and wall data survive a save/load round trip");
  assert.deepEqual(reopened.drains, doc.drains, "drain anchors remain attached to the original wall identifiers");
  assert.deepEqual(reopened.texts, doc.texts);
  assert.equal(payload.settings.rowColors["wall-color|10|8"], "#ddaa44");
  assert.throws(() => readDocument({ ...doc, pads: [{ id: 5500 }] }), /repeated/);
  assert.throws(() => readDocument({ ...doc, schemaVersion: 999 }), /newer format/);
  reserveEntityIds(reopened);
  assert.ok(nid() > 5502, "new items do not reuse identifiers after reopening a drawing");
  const { DrawingDetailsCard } = await server.ssrLoadModule("/src/foundation/ui/DrawingDetailsCard.jsx");
  const { useTakeoffAccount } = await server.ssrLoadModule("/src/foundation/hooks/useTakeoffAccount.js");
  function SignedOutAccount() {
    const account = useTakeoffAccount();
    assert.equal(account.member, null);
    assert.equal(account.canEdit, false);
    assert.equal(account.isAdmin, false);
    return React.createElement("span", null, "Signed out safely");
  }
  assert.match(renderToStaticMarkup(React.createElement(SignedOutAccount)), /Signed out safely/, "the initial null session and membership must render without crashing");
  const { TakeoffSignIn } = await server.ssrLoadModule("/src/foundation/ui/TakeoffSignIn.jsx");
  const signupHtml = renderToStaticMarkup(React.createElement(TakeoffSignIn, { account: { recovery: false, error: "" } }));
  assert.ok(signupHtml.includes("Existing West Suburban employee? Click here"));
  assert.ok(signupHtml.includes("Create a view-only account"));
  assert.ok(!signupHtml.includes("Continue with Microsoft"));
  assert.ok(signupHtml.includes("Continue with Google"));
  const unconnectedHtml = renderToStaticMarkup(React.createElement(TakeoffSignIn, { account: { recovery: false, error: "", providers: { azure: false, google: false } } }));
  assert.ok(unconnectedHtml.includes("Google sign-in is being connected."));
  const html = renderToStaticMarkup(React.createElement(DrawingDetailsCard, { kind: "create", drawings: [], busy: false, error: "", onClose() {}, onSubmit() {} }));
  for (const field of ["Customer name", "Project name", "City", "Estimator name", "Print date / revision", "Model name", "Elevation"]) assert.ok(html.includes(field), `${field} appears on the creation card`);
  console.log("Library tests passed: metadata, tract variants, search, complete drawing round-trip, colors, anchors, loaded IDs, and creation form.");
} finally { await server.close(); }
