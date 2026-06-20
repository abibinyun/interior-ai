import '@testing-library/jest-dom/vitest';

// JSDom doesn't implement the HTMLDialogElement methods (showModal,
// close). We polyfill the minimum surface so the <Modal /> component
// can mount and the tests can render it. The polyfill is a no-op in
// production browsers.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void;
    close?: () => void;
  };
  if (!proto.showModal) {
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!proto.close) {
    proto.close = function close() {
      this.removeAttribute('open');
    };
  }
}