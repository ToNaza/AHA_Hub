var versionText = 'v 0.2.6';

function setVersionText() {
    var versionElement = document.getElementById('versionInfo');

    if (versionElement && versionText) {
        versionElement.textContent = versionText;
    }
}

window.addEventListener('load', setVersionText);