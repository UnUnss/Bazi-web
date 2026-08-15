(function (global) {
    var KEY = [0x5a, 0xe3, 0x91, 0x0c, 0x77, 0xb4, 0x2d, 0xf8];

    function xorBytes(buf) {
        var out = new Uint8Array(buf);
        for (var i = 0; i < out.length; i++) out[i] ^= KEY[i % KEY.length];
        return out;
    }

    function loadObf(url, mime) {
        return fetch(url, { cache: 'force-cache' }).then(function (res) {
            if (!res.ok) throw new Error('obf ' + res.status);
            return res.arrayBuffer();
        }).then(function (buf) {
            return URL.createObjectURL(new Blob([xorBytes(buf)], { type: mime }));
        });
    }

    global.loadCoverObf = loadObf;

    var diskImg = document.querySelector('.disk-wrap .disk-img');
    if (!diskImg) return;

    if (window.innerWidth >= 721) {
        diskImg.src = 'assets/disk.webp';
        return;
    }

    loadObf('assets/obf/d', 'image/webp').then(function (url) {
        diskImg.src = url;
    }).catch(function () {});
})(window);
