/* This classic script also runs when index.html is opened as a local file. */
(() => {
  const hostedURL = 'https://jkhjkh2754-maker.github.io/attendance-roster/';
  const form = document.getElementById('roster-form');
  // Never submit roster data in a URL when app modules cannot load.
  form.addEventListener('submit', event => event.preventDefault());
  const controls = [...document.querySelectorAll('button, input, select, textarea')];
  controls.forEach(control => { control.disabled = true; });
  function showFailure(message) {
    controls.forEach(control => { control.disabled = true; });
    const status = document.getElementById('startup-status');
    const text = document.createElement('p'); text.textContent = message;
    const link = document.createElement('a'); link.href = hostedURL; link.textContent = '온라인 출석부 열기 ↗'; link.referrerPolicy = 'no-referrer';
    status.replaceChildren(text, link); status.hidden = false;
    const explanation = document.createElement('p'); explanation.className = 'mapping-banner';
    explanation.textContent = '온라인 출석부에서 미리보기와 PDF 저장을 사용할 수 있습니다. 위의 버튼으로 접속해 주세요.';
    document.getElementById('preview-pages').replaceChildren(explanation);
    document.getElementById('summary').textContent = '출석부 도구를 시작하지 못했습니다.';
  }
  if (location.protocol === 'file:') {
    showFailure('현재 PC의 HTML 파일을 직접 열었습니다. 브라우저의 파일 보안 제한으로 이 방식에서는 미리보기와 PDF 저장을 사용할 수 없습니다. 아래 버튼으로 공개 웹사이트를 열어 주세요.');
    return;
  }
  import('./app.mjs').catch(() => {
    showFailure('출석부 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요. 계속되면 최신 브라우저에서 온라인 출석부를 열어 주세요.');
  });
})();
