(() => {
  const bodyClone = document.body.cloneNode(true);
  const elementsToRemove = bodyClone.querySelectorAll('script, style, nav, footer, header, iframe, noscript, svg');
  elementsToRemove.forEach(el => el.remove());
  const rawText = bodyClone.innerText || bodyClone.textContent || "";
  return rawText.replace(/\s+/g, ' ').trim();
})();