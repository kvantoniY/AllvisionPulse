import assert from 'node:assert/strict';
const base = process.env.SMOKE_API_URL || 'http://localhost:4000';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Используйте только локальный API');
let token='',cookie='';
const checks=[];
async function req(url,method='GET',body,status=200){
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const text=await r.text();assert.equal(r.status,status,method+' '+url+' '+text.slice(0,200));
 const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(x=>x.split(';')[0]).join('; ');
 checks.push(method+' '+url+': '+r.status);return text?JSON.parse(text):null;
}
try {
 const id=Date.now().toString(36);
 const account={username:'demo_'+id,email:'demo_'+id+'@example.test',password:'Demo12345!'};

  const a=await req('/api/auth/register','POST',account);token=a.tokens.access;assert.ok(token);
  await req('/api/users/me');const p=await req('/api/tasks','POST',{title:'Проверка '+id});assert.ok(p.task.id);
  const list=await req('/api/tasks');assert.ok(list.items.some(x=>x.id===p.task.id));
  await req('/api/tasks/'+p.task.id,'PATCH',{title:'Изменено'});await req('/api/tasks/'+p.task.id,'DELETE');
  const a2=await req('/api/auth/register','POST',{...account,username:account.username+'b',email:'b'+account.email});
  const chat=await req('/api/chats/direct','POST',{userId:a2.user.id});assert.ok(chat.chat?.id || chat.id);await req('/api/chats');

 console.log('Проверка пройдена\n'+checks.join('\n'));
} catch(error) { console.error(error.message); process.exitCode=1; }
