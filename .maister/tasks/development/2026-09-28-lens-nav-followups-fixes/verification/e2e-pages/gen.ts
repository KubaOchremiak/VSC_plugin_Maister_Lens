import * as fs from 'fs'; import * as path from 'path'; import { pathToFileURL } from 'url';
import { hostDashboardHtml } from '../../../../../../src/panel/hostDashboard.ts';
import { DASHBOARD, format } from '../../../../../../src/strings.ts';
const R = process.cwd(); const out = path.resolve(process.argv[2]);
const stub = `<script>window.__posted=[];let s=null;window.acquireVsCodeApi=()=>({postMessage:m=>window.__posted.push(m),getState:()=>s,setState:n=>{s=n}});</script>`;
const u = (p:string)=>pathToFileURL(path.join(R,p)).href;
function page(bundle:string, payload:unknown, name:string){
 fs.writeFileSync(path.join(out,name+'.html'),`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><link rel="stylesheet" href="${u('media/webview.css')}">${stub}</head><body class="panel"><div id="root"></div><script src="${u('dist/webview/'+bundle+'.js')}"></script><script>setTimeout(()=>window.postMessage(${JSON.stringify(payload)},'*'),50)</script></body></html>`);
}
const fu:any = {type:'followUps',verdicts:{passed:3,passedWithIssues:1,failed:1},groups:[
 {folderUri:'file:///t/a',title:'Auth token rotation',typeLabel:'Development',verdict:'Passed with issues',activity:'2d ago',items:[
  {text:'Unescaped HTML in row',source:'issue',severity:'critical'},{text:'Clock skew on token expiry',source:'risk',severity:null},
  {text:'Deferred the retry logic to a follow-up task',source:'deferred',severity:null},{text:'Run the E2E suite against a real workspace',source:'e2e',severity:null}]},
 {folderUri:'file:///t/b',title:'Pricing page research',typeLabel:'Research',verdict:'Failed',activity:'9d ago',items:[
  {text:'Missing tier comparison',source:'issue',severity:'warning'}]}],scopedTitle:null,scopedNotCompleted:false,unreadable:2};
page('followUpsMode',fu,'followups');
page('followUpsMode',{...fu,verdicts:{passed:0,passedWithIssues:0,failed:0},groups:[],scopedTitle:'Auth token rotation',scopedNotCompleted:true,unreadable:0},'followups-scoped-empty');
const dash = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
page('dashboardMode',dash,'dashboard');
const dir = path.join(out,'hosted'); fs.mkdirSync(dir,{recursive:true});
const spec = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Spec</title></head><body><header><a href="../dashboard.html">← Dashboard</a></header><h1>Spec companion</h1></body></html>`;
const h = hostDashboardHtml(spec,{cspSource:'file:',baseHref:pathToFileURL(dir).href+'/',shimSrc:u('dist/webview/shim.js')});
if(!h) throw new Error('not hosted'); fs.writeFileSync(path.join(dir,'spec-hosted.html'), h.replace('<head>','<head>'+stub));
console.log(DASHBOARD.kpiFollowUps, format(DASHBOARD.followUpsContext,{k:2}));
