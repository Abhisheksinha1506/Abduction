import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('BUILD-001: the final standalone HTML preserves literal dollar messages and executable code',()=>{
  const root=new URL('../',import.meta.url);
  execFileSync(process.execPath,['scripts/package.mjs'],{cwd:root});
  const html=readFileSync(new URL('../release/Abduction-Midnight-Harvest.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script));
  assert.ok(script.includes("'CARGO HIT +$'"));
  assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/@import/.test(html));
  const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(css?.startsWith(':root{'),'BUILD-002: removing remote fonts must preserve the complete theme rule');
  assert.ok(css.includes('--bg:#071b22'));
});
