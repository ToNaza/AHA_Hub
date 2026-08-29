var versionText = 'v 0.0.9';

function setVersionText() {
    // Отримати елемент <p> для відображення версії
    var versionElement = document.getElementById('versionInfo');

    // Перевірити, чи існує елемент і текст версії визначений
    if (versionElement && versionText) {
        // Встановити текст версії в елемент <p>
        versionElement.textContent = versionText;
    }
}



window.addEventListener('load', setVersionText);

document.getElementById("open").addEventListener("click", function () {
    document.getElementById("modul").classList.add("open");
});

document.getElementById("close").addEventListener("click", function () {
    document.getElementById("modul").classList.remove("open");
});

function closeModal() {
    document.getElementById("modul").classList.remove("open");
}

function checkPassword() {
    const passwordInput = document.getElementById('passwordInput').value;
    const errorMessageModal = document.getElementById('errorMessageModal');
    const errorMessage = document.getElementById('errorMessage');

    closeModal(); // Закриття модального вікна перед перевіркою пароля

    // Перевірка правильності пароля
    if (passwordInput === '22814') {
        // Перенаправлення на іншу сторінку
        window.location.href = '../Громадяни/GRinfoHTML.html';
    } else if (passwordInput === '123456') {
        // Показ картинки на 2 секунди
        showImageForTwoSeconds('path-to-your-image.jpg', 200);
    } else if (passwordInput === 'Argemia.pls1724K13B1M84im3') {
        // Показ картинки та потім її приховування через 2 секунди
        const bonys = document.getElementById('bonys');
        bonys.classList.remove('hidden');
        setTimeout(function() {
            bonys.classList.add('hidden');
        }, 2000);
    } else if (passwordInput === 'Admit226317') {
        // Відкриття посилання 1
        window.open('https://t.me/+BCo7JhGt_L05YWUy');
    } else if (passwordInput === 'KOS843211') {
        // Відкриття посилання 2
        window.open('https://t.me/+li3tkW0GhFwzOTRi');
    } else if (passwordInput === 'pizza') {
        // Показ div та відтворення музики на 3 секунди
        showDivAndPlayMusic();
    } else {
        // Показ повідомлення про помилку
        errorMessage.textContent = 'Неправильний пароль, спробуйте ще раз';
        errorMessageModal.style.display = 'block';
        // Очистка поля вводу пароля
        document.getElementById('passwordInput').value = '';
    }
}

function showImageForTwoSeconds(imageUrl, width) {
    const imageElement = document.createElement('img');
    imageElement.src = imageUrl;
    imageElement.style.width = width + 'px'; // Задаємо ширину зображення

    document.body.appendChild(imageElement);

    // Затримка показу картинки на 2 секунди перед видаленням
    setTimeout(() => {
        document.body.removeChild(imageElement);
    }, 2000);
}

function showDivAndPlayMusic() {
    const hiddenDiv = document.getElementById('hiddenDiv');
    const hiddenAudio = document.getElementById('hiddenAudio');

    // Показ div
    hiddenDiv.style.display = 'block';
    // Відтворення музики
    hiddenAudio.play();

    // Приховування div та зупинка музики через 3 секунди
    setTimeout(() => {
        hiddenDiv.style.display = 'none';
        hiddenAudio.pause();
        hiddenAudio.currentTime = 0; // Скидання аудіо до початку
    }, 1000);
}



function showPopup(id) {
    document.getElementById(id).style.display = 'block';
}

function hidePopup(id) {
    document.getElementById(id).style.display = 'none';
}