/**
 * Código do botão "Enviar para o Apex" (bookmarklet) para a Meta Ad Library.
 * Corre no browser do utilizador, na página que ele está a ver: encontra os cartões de anúncio
 * pelo texto "Library ID", recolhe texto, links e media, copia um JSON para o clipboard
 * e abre o Apex para colar. Não envia nada diretamente (o CSP do Facebook bloquearia).
 */

export const BOOKMARKLET_MAX_CARDS = 300;
export const BOOKMARKLET_MAX_TEXT = 3000;

function source(origin: string): string {
  return `(function(){
var APEX=${JSON.stringify(origin)};
if(!/(^|\\.)facebook\\.com$/.test(location.hostname)){alert("Apex: abre primeiro a Meta Ad Library (facebook.com/ads/library) da marca.");return;}
var RX=/(Library ID|ID da biblioteca|ID de la biblioteca|Identifica\\u00e7\\u00e3o da biblioteca)\\s*:?\\s*\\d{6,}/i;
var RXG=/(Library ID|ID da biblioteca|ID de la biblioteca|Identifica\\u00e7\\u00e3o da biblioteca)\\s*:?\\s*\\d{6,}/gi;
function count(t){var m=(t||"").match(RXG);return m?m.length:0;}
var nodes=document.querySelectorAll("div,span"),leaves=[],i,j;
for(i=0;i<nodes.length;i++){var el=nodes[i],t=el.textContent||"";if(t.length>400||!RX.test(t))continue;var inner=false;for(j=0;j<el.children.length;j++){if(RX.test(el.children[j].textContent||"")){inner=true;break;}}if(!inner)leaves.push(el);}
var cards=[],seen=[];
for(i=0;i<leaves.length&&cards.length<${BOOKMARKLET_MAX_CARDS};i++){var p=leaves[i];while(p.parentElement&&p.parentElement!==document.body&&count(p.parentElement.textContent)===1)p=p.parentElement;if(seen.indexOf(p)!==-1)continue;seen.push(p);
var v=p.querySelector("video"),vs=v?(v.currentSrc||v.src||""):"";if(vs.indexOf("blob:")===0)vs="";
var best=null,imgs=p.querySelectorAll("img");for(j=0;j<imgs.length;j++){var im=imgs[j];if((im.naturalWidth||0)>=200&&(!best||im.naturalWidth>best.naturalWidth))best=im;}
var links=[],as=p.querySelectorAll("a[href]");for(j=0;j<as.length&&links.length<20;j++)links.push(as[j].href);
cards.push({text:(p.innerText||"").slice(0,${BOOKMARKLET_MAX_TEXT}),links:links,videoUrl:vs||null,posterUrl:v&&v.poster?v.poster:null,imageUrl:best?best.currentSrc||best.src:null});}
if(cards.length===0){alert("Apex: n\\u00e3o encontrei an\\u00fancios nesta p\\u00e1gina. Abre a Ad Library da marca, faz scroll para carregar os an\\u00fancios e tenta de novo.");return;}
var payload=JSON.stringify({v:1,source:"apex-ad-library",url:location.href,pageTitle:document.title,capturedAt:new Date().toISOString(),cards:cards});
function done(){window.open(APEX+"/spy/ads?import=1","_blank");alert("Apex: "+cards.length+" an\\u00fancios copiados. No Apex, carrega em Importar e cola (Ctrl+V).");}
function fallback(){var ta=document.createElement("textarea");ta.value=payload;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");done();}catch(e){alert("Apex: n\\u00e3o consegui copiar para o clipboard.");}document.body.removeChild(ta);}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(payload).then(done,fallback);}else{fallback();}
})();`;
}

/** URL javascript: pronto a arrastar para a barra de favoritos. */
export function buildBookmarklet(origin: string): string {
  return `javascript:${encodeURIComponent(source(origin))}`;
}

/** Código legível (para quem prefere criar o favorito à mão). */
export function bookmarkletSource(origin: string): string {
  return source(origin);
}
