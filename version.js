var versionText = 'v 0.1.8';

function setVersionText() {
    var versionElement = document.getElementById('versionInfo');

    if (versionElement && versionText) {
        versionElement.textContent = versionText;
    }
}

window.addEventListener('load', setVersionText);