// Read-only generated demo images. No editor, upload, or remote image service.
(() => {
  const script = document.currentScript;
  const base = new URL('../assets/generated/', script.src);
  const genreImages = { cafe:'cafe-cheesecake.png', men:'noodle-udon.png', niku:'meat-shabushabu.png', wa:'japanese-sashimi.png', chu:'chinese-gyoza.png', sake:'bar-yakitori.png', etc:'western-omurice.png' };
  const specific = { edw:'cafe-coffee-pancakes.png', 'babake-kamome':'western-omurice.png' };
  class DemoPhoto extends HTMLElement {
    static get observedAttributes() { return ['data-photo-id', 'id']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      const id = this.getAttribute('data-photo-id') || this.id;
      const storeId = id.replace(/^p-/, '').replace(/-\d+$/, '');
      const store = window.MESHI?.S.find(item => item.id === storeId);
      const portrait = id === 'profile-portrait';
      const filename = portrait ? 'about-food-photography.png' : specific[storeId] || genreImages[store?.g] || genreImages.etc;
      this.dataset.filled = '';
      this.style.pointerEvents = 'none';
      if (!this.shadowRoot) this.attachShadow({ mode:'open' });
      const root = this.shadowRoot;
      if (!root.querySelector('img')) root.innerHTML = '<style>:host{display:block;overflow:hidden;width:100%;height:100%}img{display:block;width:100%;height:100%;object-fit:cover}span{position:absolute;bottom:6px;right:6px;background:#15120fe0;color:#fff;padding:3px 6px;font:10px/1.5 sans-serif;border-radius:2px}:host(.pimg) span{display:none}</style><img loading="lazy" decoding="async"><span>AI生成・仮画像</span>';
      const img = root.querySelector('img');
      img.src = new URL(filename, base).href;
      img.alt = portrait ? '料理撮影の仮画像。AI生成で、飯人本人の写真ではありません。' : '料理の仮画像。AI生成で、実店舗の料理写真ではありません。';
    }
  }
  if (!customElements.get('image-slot')) customElements.define('image-slot', DemoPhoto);
})();
