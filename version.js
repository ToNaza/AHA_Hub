var versionText = 'v 0.0.10';

function setVersionText() {
    var versionElement = document.getElementById('versionInfo');

    if (versionElement && versionText) {
        versionElement.textContent = versionText;
    }
}

window.addEventListener('load', setVersionText);