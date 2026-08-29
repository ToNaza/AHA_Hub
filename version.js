var versionText = 'v 0.0.12';

function setVersionText() {
    var versionElement = document.getElementById('versionInfo');

    if (versionElement && versionText) {
        versionElement.textContent = versionText;
    }
}

window.addEventListener('load', setVersionText);