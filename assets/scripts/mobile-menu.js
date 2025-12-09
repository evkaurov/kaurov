document.addEventListener('DOMContentLoaded', function () {
    const menu = document.querySelector('.mobile-menu');
    const menuList = menu ? menu.querySelector('.mobile-menu__list') : null;
    const toggle = document.querySelector('.mobile-menu-toggle');

    if (!menu || !menuList || !toggle) {
        return;
    }

    const navItems = Array.from(document.querySelectorAll('.sidebar .nav-item'));

    menuList.innerHTML = '';
    navItems.forEach(function (item) {
        const clone = item.cloneNode(true);
        clone.classList.add('mobile-menu__link');
        menuList.appendChild(clone);
    });

    function closeMenu() {
        menu.classList.remove('mobile-menu--open');
        toggle.classList.remove('mobile-menu-toggle--open');
        toggle.setAttribute('aria-expanded', 'false');
        menu.setAttribute('hidden', 'hidden');
    }

    function openMenu() {
        menu.classList.add('mobile-menu--open');
        toggle.classList.add('mobile-menu-toggle--open');
        toggle.setAttribute('aria-expanded', 'true');
        menu.removeAttribute('hidden');
    }

    closeMenu();

    toggle.addEventListener('click', function () {
        if (menu.classList.contains('mobile-menu--open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    menuList.addEventListener('click', function (event) {
        const link = event.target.closest('.nav-item');
        if (!link) return;
        closeMenu();
    });

    document.addEventListener('click', function (event) {
        if (!menu.classList.contains('mobile-menu--open')) return;
        if (event.target.closest('.mobile-menu') || event.target.closest('.mobile-menu-toggle')) {
            return;
        }
        closeMenu();
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 600) {
            closeMenu();
        }
    });
});
