/* =====================================================================
   app.js : semua logika aplikasi HIPPAM Tirta Kencana
   Bagian A berisi pengaturan (alamat GAS, tarif, nomor WhatsApp).
   ===================================================================== */
/* =====================================================================
   BAGIAN A : PENGATURAN
   Semua data anggota, akun, dan BKU diambil dari server (Google Apps Script).
   Tidak ada data contoh atau sandi yang tertanam di file ini.
   ===================================================================== */
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
/* Tarif air per m³ menurut awalan ID anggota (dicocokkan dari atas ke bawah) */
const TARIF_KELOMPOK = [
  { awalan:/^(JBK|JBE)/i, tarif:5000 },   // Jlubang JBK & JBE (dicatat Admin 3)
  { awalan:/^JBM/i,       tarif:3000 }    // Jlubang JBM       (dicatat Admin 3)
];
const TARIF_REGULER = 4000;               // ID selain JBK/JBE/JBM (dicatat Admin 2)
const tarifUntuk = id => { const k = TARIF_KELOMPOK.find(x => x.awalan.test(String(id || ''))); return k ? k.tarif : TARIF_REGULER; };
const DENDA = 0;      // denda keterlambatan per bulan (contoh: 0, atur bila ada aturan)
const ADMIN = 0;          // biaya admin bila ada pemakaian (contoh, sesuaikan)
const HOTLINE_WA = '6285229355814'; // cadangan bila nomor Admin 2 / Admin 3 belum diisi
const WA_ADMIN2 = '6281239957828';         // nomor WhatsApp Admin 2 (contoh: 6281234567890)
const WA_ADMIN3 = '6285334101516';         // nomor WhatsApp Admin 3 (contoh: 6281234567890)
const PER_HALAMAN = 10;
/* ===== Daftar pilihan KETERANGAN transaksi BKU (silakan ubah, tambah, atau hapus baris) =====
   ket = teks yang muncul pada pilihan;  kat = kategori yang otomatis terpilih:
   Air | Operasional | Lainnya | Saldo Awal.  Daftar pemasukan dan pengeluaran dipisah.
   Contoh isi di bawah hanyalah contoh. Jangan lupa koma di akhir tiap baris kecuali baris terakhir. */
const KET_PEMASUKAN = [
  { ket:'Setoran iuran air Karangtalun',                 kat:'Air' },
  { ket:'Setoran iuran air Jlubang',               kat:'Air' },
  { ket:'Biaya pemasangan sambungan baru',   kat:'Lainnya' },
  { ket:'Denda keterlambatan',               kat:'Lainnya' },
  { ket:'Bantuan / hibah',                   kat:'Lainnya' },
  { ket:'Bunga bank',                        kat:'Lainnya' },
  { ket:'Saldo awal',                        kat:'Saldo Awal' }
];
const KET_PENGELUARAN = [
  { ket:'Pembayaran listrik pompa air',                     kat:'Operasional' },
  { ket:'Honor Pengurus HIPPAM',            kat:'Operasional' },
  { ket:'Perbaikan pipa / kebocoran',        kat:'Operasional' },
  { ket:'Pembelian bahan / sparepart pipa',       kat:'Operasional' },
  { ket:'Pembelian ATK / cetak struk',       kat:'Operasional' },
  { ket:'Rapat / konsumsi',                  kat:'Lainnya' },
  { ket:'Sumbangan ',              kat:'Lainnya' }
];
const bulanBerjalan = new Date().getMonth();
/* Pengontrolan meter dilakukan di akhir bulan untuk tagihan bulan berikutnya (dirilis tanggal 1).
   Mulai tanggal ini, pilihan bulan awal di halaman pencatat otomatis bulan depan. Isi 32 untuk menonaktifkan. */
const HARI_CATAT_BULAN_DEPAN = 25;
let tahunCatat = new Date().getFullYear();     // tahun sheet DataPetugas yang dipakai (server memilih; akhir Desember bisa tahun depan)
const bulanCatatAwal = () => { const d = new Date(); if (tahunCatat > d.getFullYear()) return 0; return (d.getDate() >= HARI_CATAT_BULAN_DEPAN && d.getMonth() < 11) ? d.getMonth() + 1 : d.getMonth(); };

// Pembagian tugas pencatat
const AWAL_JLUBANG = /^(JBK|JBE|JBM)/i;
const PETUGAS = {
  2: { nama:'Admin 2', wilayah:'DUSUN KARANGTALUN', pendek:'Karangtalun', area:'kontrol meter air di lingkungan Karangtalun', cocok: id => !AWAL_JLUBANG.test(id) },
  3: { nama:'Admin 3', wilayah:'AREA JLUBANG', pendek:'Jlubang', area:'kontrol meter air di lingkungan Jlubang', cocok: id => AWAL_JLUBANG.test(id) }
};

// Data anggota (diisi dari server setelah login): { id, nama, awalJan, akhir:[12], rp:[12], dibayar:[12] }
let ANGGOTA_SEMUA = [];
let kredAdmin = null;     // { user, sandi } admin yang sedang login (hanya di memori, hilang saat keluar/refresh)

/* =====================================================================
   KONFIGURASI SERVER (Google Apps Script Web App)
   Isi dengan URL Web App (akhiran /exec) hasil Terapkan > Deployment baru di Apps Script.
   ===================================================================== */
URL_BASE_ANGGOTA = 'https://script.google.com/macros/s/AKfycbxrnalclTofWs30fSlOZJukt3dQIemWwAdAvw2BjHjWZwxE3Tb_iSA9Ipzejn7OVv4VIA/exec';   // login anggota (action login_warga), ganti password (action ganti_password)
const URL_ADMIN23      = 'https://script.google.com/macros/s/AKfycbzRnt-v5AlwnfbFCxb5s4l3hKyvxHmgw7bISfl7tl4Hc2e0ZNqypQIGYMe5-XOZ2G2JwQ/exec';   // pencatat Admin 2 / 3 (action simpan_stan)
const URL_ADMIN1       = 'https://script.google.com/macros/s/AKfycbz_zWfWUmE5So7eNDayW5J2MiBV5giUe6rxEtYiSKHNjXBGCh5XNLyOl2lNKDuXvFFsQw/exec';   // bendahara Admin 1: BKU (action bku_list, bku_simpan, bku_hapus)
const URL_PW_ADMIN123  = 'https://script.google.com/macros/s/AKfycbzQfMjZ7BiGlp0aH0FGxzyPkX0_3zcxoYB6L9gqb22YNK5yBEGmNgTeVg1zaAuj2Egi3Q/exec';   // verifikasi sandi Admin 1/2/3 (action login_admin)

// Memanggil GAS lewat GET + parameter. Mengembalikan null bila URL kosong.
async function panggilGAS(url, data){
  if (!url) return null;
  const q = Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('\u0026');
  url = String(url).trim();
  let r;
  try{ r = await fetch(url + (url.indexOf('?') >= 0 ? '\u0026' : '?') + q, { method:'GET' }); }
  catch(e){ throw new Error('Tidak bisa menjangkau URL GAS. Pastikan URL berakhiran /exec dan akses deployment = Siapa saja.'); }
  if (!r.ok) throw new Error('Server GAS membalas HTTP ' + r.status + '. Periksa URL deployment.');
  const t = await r.text();
  try{ return JSON.parse(t); }
  catch(e){ throw new Error('Jawaban server bukan JSON (biasanya deployment belum diset Siapa saja, atau script belum diizinkan).'); }
}
const sukesGAS = r => !!r && (r.ok === true || r.success === true || r.sukses === true ||
  r.status === 'ok' || r.status === 'success' || r.status === 'sukses');

// Menambahkan user & password admin pada panggilan yang butuh login admin
const tambahKred = d => Object.assign({}, d, kredAdmin ? { user:kredAdmin.user, password:kredAdmin.sandi } : {});

// Ubah 1 anggota dari respons GAS (DataAnggota) ke format yang dipakai template
function adaptAnggota(g){
  const b = g.bulan || [];
  const ada = x => x.label === 'lunas' || x.label === 'kurang' || x.label === 'belum_bayar';
  const tagih = b.map(x => ada(x) ? (Number(x.rp) || 0) : 0);                       // bulan 0 / belum ada tagihan => 0
  const dibayar = b.map((x, i) => ada(x) ? Math.min(Number(x.dibayar) || 0, tagih[i]) : 0);   // dihitung server
  return { id:g.id, nama:g.nama, awalJan:(b[0] && b[0].awal != null) ? b[0].awal : 0,
           awalBulan:b.map(x => x.awal == null ? null : x.awal),      // stan awal apa adanya dari sheet
           statusRaw:b.map(x => (x.status === undefined || x.status === null) ? '' : x.status), label:b.map(x => x.label),   // isi sel status (untuk validasi bendahara)
           akhir:b.map(x => x.akhir === undefined ? null : x.akhir), rp:tagih, dibayar };
}
// Ubah 1 baris dari respons GAS (DataPetugas / stan_list)
function adaptStan(g){
  return { id:g.id, nama:g.nama, awalJan:(g.awal && g.awal[0] != null) ? g.awal[0] : 0,
           awalBulan:(g.awal || []).map(v => v == null ? null : v),   // stan awal apa adanya dari sheet (read-only)
           akhir:(g.akhir || []).map(v => v === undefined ? null : v), rp:[], dibayar:Array(12).fill(0) };
}

/* ---------- Fungsi bantu umum ---------- */
const rp  = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const PETA_ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => PETA_ESC[c]);   // amankan teks sebelum dimasukkan ke HTML

/* =====================================================================
   BAGIAN B : NAVIGASI LAYAR, LOGIN, LOGOUT
   ===================================================================== */
/* Tombol mata (tampil/sembunyikan) untuk semua kolom password */
function pasangMataSandi(){
  document.querySelectorAll('input[type=password]').forEach(function(inp){
    if (inp.parentNode.classList.contains('kolom-sandi')) return;
    const bungkus = document.createElement('span');
    bungkus.className = 'kolom-sandi';
    inp.parentNode.insertBefore(bungkus, inp);
    bungkus.appendChild(inp);
    inp.classList.add('in-sandi');
    const tb = document.createElement('button');
    tb.type = 'button';
    tb.className = 'mata-sandi';
    tb.setAttribute('aria-label', 'Tampilkan password');
    tb.setAttribute('aria-pressed', 'false');
    tb.textContent = 'Lihat';
    tb.addEventListener('click', function(){
      const tampil = inp.type === 'password';
      inp.type = tampil ? 'text' : 'password';
      tb.classList.toggle('buka', tampil);
      tb.textContent = tampil ? 'Tutup' : 'Lihat';
      tb.setAttribute('aria-pressed', tampil ? 'true' : 'false');
      tb.setAttribute('aria-label', tampil ? 'Sembunyikan password' : 'Tampilkan password');
      inp.focus();
    });
    bungkus.appendChild(tb);
  });
}
function sembunyikanSandi(){
  document.querySelectorAll('.kolom-sandi input').forEach(function(i){ i.type = 'password'; });
  document.querySelectorAll('.mata-sandi').forEach(function(b){
    b.classList.remove('buka');
    b.textContent = 'Lihat';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Tampilkan password');
  });
}
pasangMataSandi();

let sudahPanas = false;
function pemanasanServer(){      // bangunkan GAS lebih dulu agar login tidak menunggu cold start
  if (sudahPanas) return; sudahPanas = true;
  [URL_PW_ADMIN123, URL_BASE_ANGGOTA, URL_ADMIN1].forEach(u => { if (u) fetch(String(u).trim() + '?action=ping', { mode:'no-cors' }).catch(() => {}); });
}
function pindahLayar(id){
  if (id === 'v-admin') pemanasanServer();
  sembunyikanSandi();
  tutupBantuan();
  document.querySelectorAll('.layar').forEach(l => l.classList.remove('aktif'));
  document.getElementById(id).classList.add('aktif');
  document.body.dataset.layar = id;
  document.querySelectorAll('.pesan-login').forEach(p => p.textContent = '');
  document.querySelectorAll('form.kartu').forEach(f => f.reset());
  window.scrollTo(0, 0);
}

function aktifkanTab(layarId, tab){
  document.querySelectorAll(`#${layarId} .menu button`).forEach(b => b.classList.toggle('aktif', b.dataset.tab === tab));
  document.querySelectorAll(`#${layarId} .tab`).forEach(t => t.classList.toggle('aktif', t.dataset.tab === tab));
  if (layarId === 'v-dash' && tab === 'pemakaian') animasiPemakaian();
}
document.querySelectorAll('.menu').forEach(menu => {
  menu.addEventListener('click', e => {
    const tombol = e.target.closest('button[data-tab]');
    if (!tombol) return;
    const layarId = menu.closest('.layar').id;
    aktifkanTab(layarId, tombol.dataset.tab);
    if (layarId === 'v-dash') gulirKePanel();
    if (layarId === 'v-catat' && tombol.dataset.tab === 'rekap') renderRekapCatat();
  });
});

// Login anggota: username = ID_Anggota (kolom A DataAnggota), sandi = kolom C
document.getElementById('form-login-anggota').addEventListener('submit', async e => {
  e.preventDefault();
  const user = document.getElementById('login-user-anggota').value.trim();
  const sandi = document.getElementById('login-sandi-anggota').value;
  const pesan = document.getElementById('pesan-anggota');
  if (!URL_BASE_ANGGOTA){ pesan.textContent = 'Server belum dikonfigurasi (URL_BASE_ANGGOTA kosong).'; return; }
  pesan.textContent = 'Memeriksa...';
  try{
    const r = await panggilGAS(URL_BASE_ANGGOTA, { action:'login_warga', username:user, password:sandi });
    if (!sukesGAS(r)){ pesan.textContent = (r && r.error) || 'ID atau password salah.'; return; }
    mulaiDash(adaptTahunan(r));
  }catch(err){ pesan.textContent = (err && err.message) || 'Server tidak dapat dihubungi. Coba lagi.'; }
});

// Login admin: akun & peran dibaca dari sheet UserAdmin (Admin 1 = bendahara, 2/3 = pencatat)
document.getElementById('form-login-admin').addEventListener('submit', async e => {
  e.preventDefault();
  const user = document.getElementById('login-user-admin').value.trim();
  const sandi = document.getElementById('login-sandi-admin').value;
  const pesan = document.getElementById('pesan-admin');
  if (!URL_PW_ADMIN123){ pesan.textContent = 'Server belum dikonfigurasi (URL_PW_ADMIN123 kosong).'; return; }
  pesan.textContent = 'Memeriksa...';
  try{
    const r = await panggilGAS(URL_PW_ADMIN123, { action:'login_admin', username:user, password:sandi });
    if (!sukesGAS(r)){ pesan.textContent = (r && r.error) || 'Username atau sandi admin salah.'; return; }
    kredAdmin = { user: r.user || user, sandi: sandi, nama: String(r.nama || '').trim() };   // nama dari kolom B UserAdmin
    pesan.textContent = 'Memuat data...';
    if (r.role === 1) await mulaiBendahara();
    else if (r.role === 2 || r.role === 3) await mulaiCatat(r.role);
    else { kredAdmin = null; pesan.textContent = 'Peran akun belum diatur di sheet UserAdmin (kolom D).'; }
  }catch(err){
    kredAdmin = null;
    pesan.textContent = 'Gagal: ' + (err && err.message ? err.message : 'server tidak dapat dihubungi.');
  }
});

function keluar(){
  tutupBantuan();
  if (Object.keys(draft).length && !confirm('Ada perubahan yang belum disimpan. Tetap keluar?')) return;
  anggotaLogin = null;
  petugas = null;
  ANGGOTA = [];
  ANGGOTA_SEMUA = [];
  kredAdmin = null;
  DATA = { nama:'', id:'', bulan:[], tahunan:[] };
  Object.keys(draft).forEach(k => delete draft[k]);
  pindahLayar('v-portal');
}

/* =====================================================================
   BAGIAN C : DASHBOARD ANGGOTA
   ===================================================================== */
const SINGKAT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let anggotaLogin = null;
let DATA = { nama:'', id:'', bulan:[], tahunan:[] };

/* respons login_warga -> daftar objek per tahun (urut naik); respons lama tanpa daftar tahun dianggap satu tahun */
function adaptTahunan(r){
  const daftar = (r.tahun && r.tahun.length) ? r.tahun : [{ tahun:new Date().getFullYear(), bulan:r.bulan }];
  return daftar.map(t => Object.assign(adaptAnggota({ id:r.id, nama:r.nama, bulan:t.bulan }), { tahun:t.tahun }));
}
let tahunPem = new Date().getFullYear(), tahunRekap = new Date().getFullYear();
let filterStatus = 'belum', filterAwalDiatur = false;

function bangunBulan(a, mode){      // mode: 'berjalan' (tahun kalender) | 'lalu' (semua bulan sudah dirilis) | 'depan'
  let stan = a.awalJan;
  return BULAN.map((nama, i) => {
    const awal = (a.awalBulan && a.awalBulan[i] != null) ? a.awalBulan[i] : stan;   // dari sheet
    const akhir = a.akhir[i] === null ? awal : a.akhir[i];
    stan = akhir;
    const pakai = akhir - awal;
    const tarif = pakai > 0 ? tarifUntuk(a.id) : 0;
    const admin = pakai > 0 ? ADMIN : 0;
    return { nama, tahun:a.tahun, awal, akhir, tarif, admin, tagihan: (a.rp && a.rp[i] != null) ? Number(a.rp[i]) : pakai * tarif + admin, dibayar: a.dibayar[i], dicatat: a.akhir[i] !== null, tgl:'',
             berjalan: mode === 'berjalan' && i === bulanBerjalan,                       // tagihan bulan berjalan sudah keluar (rilis tanggal 1)
             depan: mode === 'depan' || (mode === 'berjalan' && i > bulanBerjalan) };    // bulan depan belum ada tagihan
  });
}

function mulaiDash(th){
  if (!Array.isArray(th)) th = [Object.assign({ tahun:new Date().getFullYear() }, th)];
  const kal = new Date().getFullYear();
  anggotaLogin = th[th.length - 1];
  DATA = { nama: anggotaLogin.nama, id: anggotaLogin.id, bulan:[], tahunAktif:kal,
    tahunan: th.map(a => ({ tahun:a.tahun, bulan:bangunBulan(a, a.tahun === kal ? 'berjalan' : (a.tahun < kal ? 'lalu' : 'depan')) })) };
  const utama = DATA.tahunan.filter(t => t.tahun === kal)[0] || DATA.tahunan[DATA.tahunan.length - 1];
  DATA.bulan = utama.bulan; DATA.tahunAktif = utama.tahun;
  tahunPem = utama.tahun; tahunRekap = utama.tahun; filterAwalDiatur = false;
  document.getElementById('form-pin').reset();
  document.getElementById('pesan-pin').textContent = '';
  aktifkanTab('v-dash', 'pemakaian');
  renderSemua();
  pindahLayar('v-dash');
}

const pakaiDari = b => b.akhir - b.awal;
const tunggakanDari = b => Math.max(b.tagihan - b.dibayar, 0);
function statusDari(b){
  if (b.tagihan === 0) return { teks:'Tidak ada tagihan', kelas:'nol' };
  if (b.dibayar >= b.tagihan) return { teks:'Lunas', kelas:'lunas' };
  return b.dibayar > 0 ? { teks:'Kurang Bayar', kelas:'belum' } : { teks:'Belum Bayar', kelas:'belum' };
}
const badge = s => `<span class="status ${s.kelas}">${s.teks}</span>`;

function renderPemakaian(){
  const fmt = n => n.toLocaleString('id-ID', { maximumFractionDigits:1 });
  const thnObj = DATA.tahunan.filter(t => t.tahun === tahunPem)[0] || { bulan:DATA.bulan };
  const baris = thnObj.bulan.filter(b => b.dicatat && !b.depan);   // bulan yang sudah dicatat dan sudah dirilis (bulan depan belum tampil)
  const maks = baris.reduce((m, b) => Math.max(m, pakaiDari(b)), 0);
  const mini = baris.reduce((m, b) => Math.min(m, pakaiDari(b)), Infinity);
  document.getElementById('isi-pemakaian').innerHTML = baris.length ? baris.map(b => {
    const p = pakaiDari(b), w = maks > 0 ? Math.max(p / maks * 100, p > 0 ? 4 : 0) : 0;
    const tertinggi = baris.length > 1 && maks > mini && p === maks;   // hanya bila ada variasi antar bulan
    return `<div class="pk-item${b.berjalan ? ' pk-ini' : ''}${tertinggi ? ' pk-max' : ''}">
      <div class="pk-atas"><b class="pk-bulan">${b.nama}${tagBulanIni(b)}${tertinggi ? ' <span class="tag-tertinggi">tertinggi</span>' : ''}</b>
        <span class="pk-m3">${fmt(p)} <span>m³</span></span></div>
      <div class="pk-bar" role="progressbar" aria-label="Pemakaian ${b.nama}" aria-valuemin="0" aria-valuemax="${maks}" aria-valuenow="${p}"><i data-w="${w.toFixed(1)}"></i></div>
      <div class="pk-meter"><span>Meter awal <b>${b.awal}</b></span><span>Meter akhir <b>${b.akhir}</b></span></div>
    </div>`;
  }).join('') : '<div class="kosong pk-kosong">Belum ada data pemakaian.</div>';
  animasiPemakaian();
  const total = baris.reduce((s, b) => s + pakaiDari(b), 0);
  const rata = baris.length ? total / baris.length : 0;
  document.getElementById('pem-total').innerHTML = `${fmt(total)} <span>m³</span>`;
  document.getElementById('pem-total-ket').textContent = baris.length ? `dalam ${baris.length} bulan terakhir` : 'belum ada data';
  document.getElementById('pem-rata').innerHTML = `${fmt(rata)} <span>m³</span>`;
  document.getElementById('pem-tahun').innerHTML = DATA.tahunan.map(t => t.tahun).sort((a, b) => b - a)
    .map(y => `<option value="${y}"${y === tahunPem ? ' selected' : ''}>Tahun ${y}</option>`).join('');
}
document.getElementById('pem-tahun').addEventListener('change', e => { tahunPem = Number(e.target.value); renderPemakaian(); });
function animasiPemakaian(){      // bar terisi bertahap (efek loading); dipanggil saat render dan saat tab dibuka
  const bar = [...document.querySelectorAll('#isi-pemakaian .pk-bar i')];
  bar.forEach(i => { i.style.transition = 'none'; i.style.width = '0'; });
  void document.body.offsetWidth;
  bar.forEach(i => { i.style.transition = ''; i.style.width = i.dataset.w + '%'; });
}
const IK_CEK = '<path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.8 7.2 19.4 5.8z"/>';
const IK_AWAS = '<path d="M12 2 1 21h22zM11 9h2v6h-2zm0 7h2v2h-2z"/>';
const IK_JEMPOL = '<path d="M2 10h4v11H2zm6 11h9.4a2 2 0 0 0 2-1.6l1.4-7a2 2 0 0 0-2-2.4H14l.9-4.1A2.5 2.5 0 0 0 12.5 3L8 10z"/>';
function setKartu(id, warna, ikon, judul, nilai, ket){
  const k = document.getElementById(id);
  k.className = 'kartu-pem kartu-lebar ' + warna;
  k.querySelector('.ik-bulat svg').innerHTML = ikon;
  k.querySelector('.ik-bulat').className = 'ik-bulat besar ' + warna;
  k.querySelector('small').textContent = judul;
  k.querySelector('b').textContent = nilai;
  k.querySelector('.ket').textContent = ket;
}
/* Satu kriteria tunggakan: bulan yang sudah ditagihkan (termasuk bulan berjalan dan tahun-tahun lalu) dan belum lunas, meski hanya 1 bulan */
const semuaBulan = () => DATA.tahunan.reduce((h, t) => h.concat(t.bulan), []);
const tunggakanList = () => semuaBulan().filter(b => !b.depan && tunggakanDari(b) > 0);
const dendaDari = b => (b.berjalan ? 0 : DENDA);                 // bulan berjalan belum dikenai denda
const jumlahBayar = b => tunggakanDari(b) + dendaDari(b);
const tagBulanIni = b => (b.berjalan ? ' <span class="tag-bulan-ini">bulan ini</span>' : '');
const labelBulan = b => (b.tahun !== DATA.tahunAktif ? b.nama + ' ' + b.tahun : b.nama);

function renderRingkas(){
  const ini = DATA.bulan[bulanBerjalan];
  const daftar = tunggakanList();
  const total = daftar.reduce((s, b) => s + jumlahBayar(b), 0);
  const el = id => document.getElementById(id);
  el('ringkas-bayar').classList.toggle('ok', total === 0);
  el('ringkas-periode').textContent = 'Ringkasan ' + BULAN[bulanBerjalan] + ' ' + new Date().getFullYear();
  el('ringkas-badge').textContent = total === 0 ? 'Lunas' : 'Belum Bayar';
  const adaPakai = !!(ini && ini.dicatat);
  el('rg-pakai').innerHTML = adaPakai ? `${angka(pakaiDari(ini))} <span>m³</span>` : '—';
  if (ini && ini.tagihan > 0){ el('rg-tagihan').textContent = rp(ini.tagihan); el('rg-tagihan-ket').textContent = statusDari(ini).teks; }
  else if (adaPakai && pakaiDari(ini) === 0){ el('rg-tagihan').textContent = rp(0); el('rg-tagihan-ket').textContent = 'Tidak ada pemakaian'; }
  else { el('rg-tagihan').textContent = '—'; el('rg-tagihan-ket').textContent = 'Belum ada tagihan'; }
  el('rg-tunggakan').textContent = rp(total);
  el('rg-tunggakan-ket').textContent = total === 0 ? 'Tidak ada tunggakan' : daftar.length + ' bulan belum dibayar';
  el('rg-lihat').style.display = total === 0 ? 'none' : '';
}

function gulirKePanel(){            // HP: nav menu di bawah layar, jadi tampilkan awal konten tab
  if (!window.matchMedia('(max-width:768px)').matches) return;
  const panel = document.querySelector('#v-dash .panel');
  window.scrollTo({ top: Math.max(panel.getBoundingClientRect().top + window.scrollY - 10, 0), behavior:'smooth' });
}
function bukaTunggakan(){           // ketuk kotak "Total tunggakan" -> menu Status, hanya yang belum bayar
  filterStatus = 'belum'; filterAwalDiatur = true;
  aktifkanTab('v-dash', 'status'); renderStatus(); gulirKePanel();
}
document.querySelectorAll('#filter-status button').forEach(b => b.addEventListener('click', () => {
  filterStatus = b.dataset.f; filterAwalDiatur = true; renderStatus();
}));

function renderStatus(){
  const daftarT = tunggakanList();
  const total = daftarT.reduce((s, b) => s + jumlahBayar(b), 0);
  const totalDenda = daftarT.reduce((s, b) => s + dendaDari(b), 0);
  const bayar = semuaBulan().filter(b => b.dibayar > 0);
  const terakhir = bayar.length ? (bayar[bayar.length - 1].tgl || '-') : '-';
  const ketTgl = terakhir !== '-' ? ' · Pembayaran terakhir: ' + terakhir : '';
  if (!daftarT.length) setKartu('kartu-status', 'hijau', IK_CEK, 'Status Anda saat ini', 'Lunas', 'Semua tagihan sudah lunas.' + ketTgl);
  else setKartu('kartu-status', 'jingga', IK_AWAS, 'Status Anda saat ini', daftarT.length + ' bulan belum lunas', 'Total tunggakan: ' + rp(total) + ketTgl);

  const riwayat = semuaBulan().filter(b => b.tagihan > 0 && !b.depan);          // urut waktu naik
  if (!filterAwalDiatur){ filterStatus = daftarT.length ? 'belum' : 'semua'; filterAwalDiatur = true; }
  document.querySelectorAll('#filter-status button').forEach(b => b.classList.toggle('aktif', b.dataset.f === filterStatus));
  document.getElementById('fs-belum').textContent = daftarT.length;
  document.getElementById('fs-semua').textContent = riwayat.length;
  const daftar = filterStatus === 'belum' ? daftarT : riwayat.slice().reverse();   // tunggakan: terlama di atas; semua: terbaru di atas
  const catatan = b => {            // keterangan kecil di bawah tagihan: sisa (cicilan) dan denda
    const t = [];
    if (b.dibayar > 0 && tunggakanDari(b) > 0) t.push('sisa ' + rp(tunggakanDari(b)));
    if (tunggakanDari(b) > 0 && dendaDari(b) > 0) t.push('+ denda ' + rp(dendaDari(b)));
    return t.length ? '<small class="sisa">' + t.join(' ') + '</small>' : '';
  };
  document.getElementById('isi-status').innerHTML = daftar.length ? daftar.map(b => `
    <tr class="${tunggakanDari(b) > 0 ? 'baris-belum' : ''}">
    <td>${labelBulan(b)}${tagBulanIni(b)}</td>
    <td class="angka"><b>${rp(b.tagihan)}</b>${catatan(b)}</td>
    <td class="c">${badge(statusDari(b))}</td></tr>`).join('')
    : `<tr><td colspan="3" class="kosong">${filterStatus === 'belum' ? 'Tidak ada tunggakan. Terima kasih telah tepat waktu!' : 'Belum ada riwayat tagihan.'}</td></tr>`;
  document.getElementById('foot-status').innerHTML = daftarT.length
    ? `<tr><td>Total yang harus dibayar</td><td class="angka"><b>${rp(total)}</b>${totalDenda > 0 ? '<small class="sisa">termasuk denda ' + rp(totalDenda) + '</small>' : ''}</td><td></td></tr>` : '';
}

/* Terbilang rupiah, mis. 15000 -> "Lima Belas Ribu Rupiah" */
function terbilang(n){
  const s = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  n = Math.floor(n);
  if (n < 12) return s[n];
  if (n < 20) return terbilang(n-10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n/10)) + ' puluh' + (n%10 ? ' ' + terbilang(n%10) : '');
  if (n < 200) return 'seratus' + (n-100 ? ' ' + terbilang(n-100) : '');
  if (n < 1000) return terbilang(Math.floor(n/100)) + ' ratus' + (n%100 ? ' ' + terbilang(n%100) : '');
  if (n < 2000) return 'seribu' + (n-1000 ? ' ' + terbilang(n-1000) : '');
  if (n < 1e6) return terbilang(Math.floor(n/1e3)) + ' ribu' + (n%1e3 ? ' ' + terbilang(n%1e3) : '');
  if (n < 1e9) return terbilang(Math.floor(n/1e6)) + ' juta' + (n%1e6 ? ' ' + terbilang(n%1e6) : '');
  return terbilang(Math.floor(n/1e9)) + ' miliar' + (n%1e9 ? ' ' + terbilang(n%1e9) : '');
}
const terbilangRp = n => n === 0 ? 'Nol Rupiah'
  : terbilang(n).replace(/\b\w/g, c => c.toUpperCase()) + ' Rupiah';

function renderStruk(){
  const b = DATA.bulan[Number(document.getElementById('pilih-bulan-struk').value)];
  const s = statusDari(b);
  const lunas = s.kelas === 'lunas';
  const air = b.tagihan - b.admin;
  const tglCetak = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' });
  document.getElementById('struk').innerHTML = `
    <div class="instansi">
      <b>HIMPUNAN PENDUDUK PENGGUNA AIR MINUM</b><br/>
      <b>HIPPAM "TIRTA KENCANA"</b>
      <small>Karangtalun, Desa Gedompol, Kec. Donorojo, Pacitan</small>
	<div class="baris"><span>Hotline WA</span><b>${hotlineStruk()}</b></div>
    </div>
    <hr>
    <div class="baris"><span>ID Anggota</span><b>${esc(DATA.id)}</b></div>
    
    <div class="baris"><span>Nama Anggota</span><b>${esc(DATA.nama)}</b></div>
    <div class="baris"><span>Periode Bulan</span><b>${b.nama}</b></div>
    <div class="baris"><span>Stand Awal - Akhir</span><b>${b.awal} - ${b.akhir}</b></div>
    <div class="baris"><span>Pemakaian Air</span><b>${pakaiDari(b)} m³</b></div>
    <div class="baris"><span>Tarif / m³</span><b>${rp(b.tarif)}</b></div>
    <hr>
    <div class="baris"><span>Tagihan Air</span><b>${rp(air)}</b></div>
    <div class="baris"><span>Biaya Admin</span><b>${rp(b.admin)}</b></div>
    <div class="baris total"><span>TOTAL BAYAR</span><b>${rp(b.tagihan)}</b></div>
    <div class="baris"><span>Terbilang</span><b><i>${terbilangRp(b.tagihan)}</i></b></div>
    <div class="baris"><span>Status</span><b>${s.teks.toUpperCase()}</b></div>
    ${lunas ? '<div class="qr"><div class="qr-kotak" id="qr-kotak"></div><small>Scan QR Code untuk verifikasi keabsahan</small></div>' : ''}
    <div class="baris"><span>Tgl Cetak</span><b>${tglCetak}</b></div>
    <hr>
    <div class="tengah">
      ${lunas ? '<small>* Struk ini adalah bukti pembayaran yang sah *</small><small>Terima Kasih atas Pembayaran Tepat Waktu</small>'
              : '<small>* Belum lunas: ini rincian tagihan, bukan bukti pembayaran *</small>'}
    </div>`;

  // QR berisi data verifikasi. Ganti isinya dengan alamat halaman verifikasi bila sudah ada.
  const kotak = document.getElementById('qr-kotak');
  if (kotak){
    const isiQr = `HIPPAM TIRTA KENCANA|${DATA.id}|${b.nama}|${b.tagihan}|${s.teks}|${tglCetak}`;
    buatQR(kotak, isiQr, 100, null, 'QR');
  }

  // Cetak / Simpan PDF hanya untuk bulan yang sudah Lunas
  document.getElementById('struk').classList.toggle('belum-lunas', !lunas);
  document.getElementById('btn-struk-cetak').disabled = !lunas;
  document.getElementById('btn-struk-pdf').disabled = !lunas;
  document.getElementById('info-struk').textContent = lunas ? '' :
    (s.kelas === 'nol' ? 'Bulan ' + b.nama + ' tidak ada tagihan, struk tidak tersedia.'
      : 'Struk bulan ' + b.nama + ' belum bisa dicetak karena status: ' + s.teks + '. Cetak tersedia setelah status Lunas.');
}

function renderRekapAnggota(){
  const th = DATA.tahunan.filter(t => t.tahun === tahunRekap)[0] || DATA.tahunan[DATA.tahunan.length - 1];
  tahunRekap = th.tahun;
  document.getElementById('rekap-tahun-anggota').innerHTML = DATA.tahunan.map(t => t.tahun).sort((a, b) => b - a)
    .map(y => `<option value="${y}"${y === tahunRekap ? ' selected' : ''}>Tahun ${y}</option>`).join('');
  const fmt = n => n.toLocaleString('id-ID', { maximumFractionDigits:1 });
  const aktif = th.bulan.filter(b => !b.depan && b.dicatat);                  // bulan yang sudah dirilis dan tercatat
  document.getElementById('isi-rekap').innerHTML = th.bulan.map(b => {
    if (b.depan || !b.dicatat)
      return `<tr class="baris-pasif"><td>${b.nama}</td><td class="c">-</td><td class="c">-</td><td class="angka">-</td><td class="angka">-</td><td class="angka">-</td><td class="angka">-</td>
        <td><span class="status nol">${b.depan ? 'Belum berjalan' : 'Belum dicatat'}</span></td></tr>`;
    return `<tr><td>${b.nama}</td><td class="c">${b.awal}</td><td class="c">${b.akhir}</td>
      <td class="angka">${fmt(pakaiDari(b))} m³</td><td class="angka">${rp(b.tagihan)}</td>
      <td class="angka">${rp(b.dibayar)}</td><td class="angka">${rp(tunggakanDari(b))}</td><td>${badge(statusDari(b))}</td></tr>`;
  }).join('');
  const sum = f => aktif.reduce((s, b) => s + f(b), 0);
  const tPakai = sum(pakaiDari), tTagih = sum(b => b.tagihan), tBayar = sum(b => b.dibayar), tKurang = sum(tunggakanDari);
  document.getElementById('foot-rekap').innerHTML = `
    <tr><td colspan="3">Total</td><td class="angka">${fmt(tPakai)} m³</td><td class="angka">${rp(tTagih)}</td>
    <td class="angka">${rp(tBayar)}</td><td class="angka">${rp(tKurang)}</td><td></td></tr>`;
  // ringkasan di bawah tabel
  const nKurang = aktif.filter(b => tunggakanDari(b) > 0).length;
  const maks = aktif.reduce((m, b) => Math.max(m, pakaiDari(b)), 0), mini = aktif.reduce((m, b) => Math.min(m, pakaiDari(b)), Infinity);
  const tertinggi = aktif.filter(b => pakaiDari(b) === maks)[0];
  document.getElementById('rekap-ringkas').innerHTML =
    `<p>Rata-rata pemakaian: <b>${fmt(aktif.length ? tPakai / aktif.length : 0)} m³</b> per bulan (dari ${aktif.length} bulan tercatat).</p>`
    + (aktif.length > 1 && maks > mini ? `<p>Pemakaian tertinggi: <b>${tertinggi.nama} (${fmt(maks)} m³)</b>.</p>` : '')
    + (tKurang === 0 ? `<p>Status akhir: <b>Lunas</b>, seluruh tagihan tahun ${th.tahun} sudah dibayar.</p>`
                     : `<p>Status akhir: <b>Belum lunas</b>, kurang bayar ${rp(tKurang)} (${nKurang} bulan).</p>`);
  // kartu ringkas untuk layar kecil
  document.getElementById('rk-pakai').textContent = fmt(tPakai) + ' m³';
  document.getElementById('rk-tagihan').textContent = rp(tTagih);
  document.getElementById('rk-bayar').textContent = rp(tBayar);
  document.getElementById('rk-kurang').textContent = rp(tKurang);
  document.getElementById('rk-kurang').parentNode.classList.toggle('ok', tKurang === 0);
  // kop surat
  document.getElementById('kop-id').textContent = DATA.id;
  document.getElementById('kop-nama').textContent = DATA.nama;
  document.getElementById('kop-tahun').textContent = th.tahun;
  document.getElementById('rekap-tarif').textContent = th.tahun === DATA.tahunAktif
    ? 'Tarif air: ' + rp(tarifUntuk(DATA.id)) + ' per m³ · Biaya admin: ' + rp(ADMIN) + ' per bulan' : '';
  document.getElementById('ttd-tgl').textContent = 'Karangtalun, ' + new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
}
document.getElementById('rekap-tahun-anggota').addEventListener('change', e => { tahunRekap = Number(e.target.value); renderRekapAnggota(); });

/* Salam sesuai waktu perangkat */
function perbaruiSapaan(){
  const jam = new Date().getHours();
  let teks, ikon;
  if (jam >= 4 && jam < 11)       { teks = 'Selamat Pagi';  ikon = '🌅'; }
  else if (jam >= 11 && jam < 15) { teks = 'Selamat Siang'; ikon = '☀️'; }
  else if (jam >= 15 && jam < 18) { teks = 'Selamat Sore';  ikon = '🌇'; }
  else                            { teks = 'Selamat Malam'; ikon = '🌙'; }
  document.getElementById('dash-sapaan').textContent = teks;
  document.getElementById('dash-ikon').textContent = ikon;
}

/* ---------- Hotline CS & Kartu Anggota ---------- */
const rapikanWA = n => {
  let d = String(n || '').replace(/[^0-9]/g, '');
  if (d.charAt(0) === '0') d = '62' + d.slice(1);
  return d;
};
const waAdminArea = () => (AWAL_JLUBANG.test(DATA.id) ? 3 : 2);
function hotlineStruk(){
  const n = waAdminArea() === 3 ? WA_ADMIN3 : WA_ADMIN2;
  return n ? n : HOTLINE_WA;
}
/* ---------- Bantuan (WhatsApp petugas), tombol di pojok kanan atas header ---------- */
function renderBantuan(){
  const pop = document.getElementById('bantuan-pop');
  const anggota = !!anggotaLogin;
  const sendiri = anggota ? 0 : (petugas === PETUGAS[3] ? 3 : 2);              // peran admin yang sedang login
  const utama = anggota ? waAdminArea() : (sendiri === 3 ? 2 : 3);               // anggota: admin area; admin: rekan petugas lain
  [2, 3].forEach(r => {
    const no = r === 3 ? WA_ADMIN3 : WA_ADMIN2;
    pop.querySelector('.wa-no[data-wa="' + r + '"]').textContent = no ? no : 'Nomor belum diisi';
    pop.querySelector('.hl-area[data-wa="' + r + '"]').textContent = anggota ? (r === utama ? 'Area Anda' : '') : (r === sendiri ? 'Anda' : '');
    pop.querySelector('.hl-wa[data-wa="' + r + '"]').classList.toggle('utama', r === utama);
  });
}
function bukaBantuan(btn){
  const pop = document.getElementById('bantuan-pop');
  if (!pop.hidden){ tutupBantuan(); return; }
  renderBantuan();
  const r = btn.getBoundingClientRect();
  pop.style.top = Math.round(r.bottom + 8) + 'px';
  pop.style.right = Math.max(10, Math.round(window.innerWidth - r.right)) + 'px';
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}
function tutupBantuan(){
  const pop = document.getElementById('bantuan-pop');
  if (pop) pop.hidden = true;
  document.querySelectorAll('.btn-bantuan').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e => { if (!e.target.closest('#bantuan-pop') && !e.target.closest('.btn-bantuan')) tutupBantuan(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupBantuan(); });
window.addEventListener('scroll', tutupBantuan, { passive:true });
function bukaWA(r){
  const nomor = rapikanWA(r === 3 ? WA_ADMIN3 : WA_ADMIN2);
  if (!nomor){ tampilToast('Nomor WhatsApp Admin ' + r + ' belum diisi.'); return; }
  const pesan = anggotaLogin
    ? 'Halo Admin ' + r + ' HIPPAM Tirta Kencana, saya ' + DATA.nama + ' (ID ' + DATA.id + ').'
    : 'Halo Admin ' + r + ' HIPPAM Tirta Kencana, saya ' + ((kredAdmin && kredAdmin.nama) || 'petugas') + (petugas ? ' (' + petugas.nama + ')' : '') + '.';
  window.open('https://wa.me/' + nomor + '?text=' + encodeURIComponent(pesan), '_blank', 'noopener');
  tutupBantuan();
}
function renderKartu(){
  document.getElementById('txtIdAktif').textContent = DATA.id;
  document.getElementById('txtNamaAktif').textContent = DATA.nama;
  buatQR(document.getElementById('kartu-qr'), 'HIPPAM TIRTA KENCANA|' + DATA.id, 168,
         { colorDark:'#0f172a', colorLight:'#ffffff' }, DATA.id);
}
/* Membuat QR di dalam elemen. Bila pustaka QR belum termuat, dicoba dimuat dari CDN cadangan;
   bila tetap gagal, elemen berisi teks cadangan (bukan kosong). */
function buatQR(kotak, teks, ukuran, warna, cadangan){
  if (!kotak) return;
  const gambar = () => {
    kotak.innerHTML = '';
    new QRCode(kotak, Object.assign({ text:teks, width:ukuran, height:ukuran, correctLevel:QRCode.CorrectLevel.M }, warna || {}));
  };
  if (window.QRCode){ gambar(); return; }
  kotak.textContent = cadangan || 'QR';
  const sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
  sc.onload = () => { if (window.QRCode && kotak.isConnected) gambar(); };
  document.head.appendChild(sc);
}
function cetakKartuPNG(){
  const el = document.getElementById('printCard');
  if (!el) return;
  if (typeof html2canvas !== 'undefined'){
    html2canvas(el, { scale:3, useCORS:true, backgroundColor:null }).then(function(canvas){
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'Kartu-Anggota-HIPPAM-' + DATA.id + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  } else {
    tampilToast('Pustaka gambar belum termuat. Memakai jendela cetak, pilih Simpan sebagai PDF.');
    cetakHalaman('kartu', true);
  }
}

function renderSemua(){
  document.getElementById('dash-nama').textContent = DATA.nama;
  document.getElementById('dash-id').textContent = DATA.id;
  const sel = document.getElementById('pilih-bulan-struk');
  sel.innerHTML = BULAN.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  sel.value = bulanBerjalan;
  renderRingkas(); renderPemakaian(); renderStatus(); renderStruk(); renderRekapAnggota(); renderKartu();
  perbaruiSapaan();
}
document.getElementById('pilih-bulan-struk').addEventListener('change', renderStruk);
setInterval(perbaruiSapaan, 60000);

/* Ubah password anggota (disimpan di kolom C sheet DataAnggota lewat GAS) */
document.getElementById('form-pin').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const lama = document.getElementById('pin-lama').value;
  const baru = document.getElementById('pin-baru').value;
  const pesan = document.getElementById('pesan-pin');
  const gagal = teks => { pesan.textContent = teks; pesan.className = 'pesan err'; };
  pesan.className = 'pesan';
  if (baru.length < 6) return gagal('Password baru minimal 6 karakter.');
  if (baru === lama) return gagal('Password baru harus berbeda dari password lama.');
  if (!URL_BASE_ANGGOTA) return gagal('Server belum dikonfigurasi.');
  try{
    const r = await panggilGAS(URL_BASE_ANGGOTA, { action:'ganti_password', id:DATA.id, password_lama:lama, password_baru:baru });
    if (!sukesGAS(r)) return gagal((r && r.error) || 'Password lama tidak sesuai atau perubahan ditolak server.');
    pesan.textContent = 'Password berhasil diubah.'; pesan.className = 'pesan ok';
  }catch(err){ return gagal('Server tidak dapat dihubungi. Coba lagi.'); }
  form.reset();
});

/* =====================================================================
   BAGIAN D : PENCATAT METER (ADMIN 2 / ADMIN 3)
   ===================================================================== */
let petugas = null;
let ANGGOTA = [];
let halamanCatat = 1;
const draft = {};   // perubahan belum disimpan: "ID|bulan" -> teks angka ('' = dikosongkan)
const kunci = (a, m) => a.id + '|' + m;

async function mulaiCatat(role){
  petugas = PETUGAS[role];
  if (!URL_ADMIN23) throw new Error('URL_ADMIN23 belum diisi.');
  const r = await panggilGAS(URL_ADMIN23, tambahKred({ action:'stan_list', petugas:petugas.nama }));
  if (!sukesGAS(r)) throw new Error((r && r.error) || 'Data petugas ditolak server.');
  tahunCatat = Number(r.tahun) || new Date().getFullYear();
  ANGGOTA = (r.data || []).map(adaptStan).filter(a => petugas.cocok(a.id));   // hanya area petugas ini
  halamanCatat = 1;
  Object.keys(draft).forEach(k => delete draft[k]);
  document.getElementById('nama-admin').textContent = (kredAdmin && kredAdmin.nama) || petugas.nama;   // nama dari sheet UserAdmin
  document.getElementById('area-admin').textContent = 'Area: ' + petugas.area + (tahunCatat !== new Date().getFullYear() ? ' · Tahun ' + tahunCatat : '');
  perbaruiIkonCatat();
  document.getElementById('cari-anggota').value = '';
  document.getElementById('rekap-head').textContent = 'Rekapitulasi Bulanan ' + petugas.pendek;
  ['bulan-input','bulan-rekap'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = BULAN.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    sel.value = bulanCatatAwal();   // bulan yang sedang dicatat saat muat pertama
  });
  aktifkanTab('v-catat', 'input');
  renderInput();
  renderRekapCatat();
  perbaruiStatus();
  pindahLayar('v-catat');
}

function akhirDari(a, m, pakaiDraft){
  const k = kunci(a, m);
  if (pakaiDraft && k in draft) return draft[k] === '' ? null : Number(draft[k]);
  return a.akhir[m];
}
function awalDari(a, m, pakaiDraft){
  // Stan awal SELALU dibaca dari sheet (read-only). Nilainya bisa 0 saat meteran diganti,
  // jadi tidak boleh diganti dengan stan akhir bulan sebelumnya. Rantai di bawah hanya cadangan bila sel awal kosong.
  if (a.awalBulan && a.awalBulan[m] != null) return a.awalBulan[m];
  if (m === 0) return a.awalJan;
  const sebelum = akhirDari(a, m - 1, pakaiDraft);
  return sebelum !== null ? sebelum : awalDari(a, m - 1, pakaiDraft);
}
function hitung(a, m, pakaiDraft){
  const awal = awalDari(a, m, pakaiDraft);
  const akhir = akhirDari(a, m, pakaiDraft);
  if (akhir === null) return { awal, akhir:null, volume:null, harga:null, salah:false };
  const volume = akhir - awal;
  if (volume < 0) return { awal, akhir, volume, harga:null, salah:true };
  const dariSheet = a.rp && a.rp[m] != null && !(pakaiDraft && kunci(a, m) in draft);   // tagihan resmi dari sheet bila ada
  return { awal, akhir, volume, harga: dariSheet ? Number(a.rp[m]) : (volume > 0 ? volume * tarifUntuk(a.id) + ADMIN : 0), salah:false };
}

function daftarTampil(){
  const q = (document.getElementById('cari-anggota').value || '').trim().toLowerCase();
  return q ? ANGGOTA.filter(a => a.id.toLowerCase().includes(q) || a.nama.toLowerCase().includes(q)) : ANGGOTA;
}
const totalHalaman = () => Math.max(1, Math.ceil(daftarTampil().length / PER_HALAMAN));
function perbaruiIkonCatat(){
  const j = new Date().getHours();
  document.getElementById('cat-ikon').textContent = j >= 4 && j < 11 ? '🌅' : j < 15 && j >= 11 ? '☀️' : j >= 15 && j < 18 ? '🌇' : '🌙';
}
function perbaruiTotalArea(){
  if (!petugas) return;
  const m = bulanInput();
  let tot = 0, tag = 0;
  ANGGOTA.forEach(a => { const h = hitung(a, m, true); if (h.volume !== null && !h.salah){ tot += h.volume; tag += h.harga || 0; } });
  document.getElementById('total-area').textContent = tot + ' m³';
  document.getElementById('total-tagihan').textContent = rp(tag);
  perbaruiProgres();
}
/* Progres pencatatan bulan terpilih: stan akhir sudah terisi (termasuk yang belum disimpan) */
function perbaruiProgres(){
  const m = bulanInput(), y = ANGGOTA.length;
  const belum = ANGGOTA.filter(a => hitung(a, m, true).akhir === null);
  const x = y - belum.length, pct = y ? Math.round(x / y * 100) : 0;
  document.getElementById('pc-bulan').textContent = BULAN[m];
  document.getElementById('pc-teks').textContent = `sudah ${x} dari ${y} anggota (${pct}%)`;
  document.getElementById('pc-isi').style.width = pct + '%';
  document.getElementById('progres-cat').classList.toggle('selesai', y > 0 && !belum.length);
  const tb = document.getElementById('pc-tombol'), dft = document.getElementById('pc-daftar');
  tb.disabled = !belum.length;
  if (!belum.length) dft.classList.remove('tampil');
  tb.textContent = !belum.length ? (y ? '✓ Semua anggota sudah dicatat' : 'Tidak ada anggota') : (dft.classList.contains('tampil') ? 'Sembunyikan daftar' : `Lihat yang belum dicatat (${belum.length})`);
  dft.innerHTML = belum.map(a => `<button type="button" class="pc-chip" data-id="${esc(a.id)}"><b>${esc(a.id)}</b> ${esc(a.nama)}</button>`).join('');
}
document.getElementById('pc-tombol').addEventListener('click', () => {
  document.getElementById('pc-daftar').classList.toggle('tampil');
  perbaruiProgres();
});
document.getElementById('pc-daftar').addEventListener('click', e => {      // ketuk nama = langsung ke baris anggota itu
  const c = e.target.closest('.pc-chip');
  if (!c) return;
  document.getElementById('cari-anggota').value = c.dataset.id;
  halamanCatat = 1; renderInput();
  const inp = document.querySelector('#isi-input .in-akhir');
  if (inp){ inp.scrollIntoView({ behavior:'smooth', block:'center' }); inp.focus(); }
});
const bulanInput = () => Number(document.getElementById('bulan-input').value);

function isiBarisHitung(tr){
  const a = ANGGOTA.find(x => x.id === tr.dataset.id);
  const m = bulanInput();
  const h = hitung(a, m, true);
  const input = tr.querySelector('.in-akhir');
  tr.querySelector('.awal').textContent = h.awal;
  tr.querySelector('.vol').textContent = h.volume === null ? '-' : (h.salah ? 'Salah' : h.volume);
  tr.querySelector('.hrg').textContent = h.harga === null ? '-' : rp(h.harga);
  input.classList.toggle('salah', h.salah);
  const diubah = kunci(a, m) in draft;
  input.classList.toggle('ubah', !h.salah && diubah);
  let kelas = 'valid', teks = '✓ Valid';
  if (h.salah){ kelas = 'salah'; teks = 'Salah'; }
  else if (diubah){ kelas = 'ubah'; teks = 'Diubah'; }
  else if (h.akhir === null){ kelas = 'kosong'; teks = 'Kosong'; }
  tr.querySelector('.st').innerHTML = `<span class="pil-st ${kelas}">${teks}</span>`;
  tr.querySelector('.kebab').disabled = !diubah;
}

function renderInput(){
  const m = bulanInput();
  const daftar = daftarTampil();
  if (halamanCatat > totalHalaman()) halamanCatat = totalHalaman();
  const mulai = (halamanCatat - 1) * PER_HALAMAN;
  const baris = daftar.slice(mulai, mulai + PER_HALAMAN);
  const tbody = document.getElementById('isi-input');
  if (!baris.length){
    tbody.innerHTML = `<tr class="tr-kosong"><td colspan="9" class="kosong">${ANGGOTA.length ? 'Tidak ada pelanggan yang cocok dengan pencarian.' : 'Tidak ada anggota pada area ini.'}</td></tr>`;
  } else {
    tbody.innerHTML = baris.map(a => {
      const k = kunci(a, m);
      const nilai = k in draft ? draft[k] : (a.akhir[m] === null ? '' : a.akhir[m]);
      return `<tr data-id="${esc(a.id)}">
        <td data-label="No" class="no">${ANGGOTA.indexOf(a) + 1}</td>
        <td data-label="ID Anggota" class="idc">${esc(a.id)}</td>
        <td data-label="Nama" class="nmc">${esc(a.nama)}</td>
        <td data-label="Stan Awal" class="c awal"></td>
        <td data-label="Stan Akhir" class="c col-aktif"><input class="in-akhir" type="text" inputmode="numeric" maxlength="6" placeholder="isi" aria-label="Stan akhir ${esc(a.id)}" value="${nilai}"></td>
        <td data-label="Volume (m³)" class="c vol"></td>
        <td data-label="Harga (Rp.)" class="angka hrg"></td>
        <td data-label="Status" class="c st"></td>
        <td class="kol-k"><button type="button" class="kebab" title="Batalkan perubahan baris ini" aria-label="Batalkan perubahan baris">⋮</button></td></tr>`;
    }).join('');
    tbody.querySelectorAll('tr').forEach(isiBarisHitung);
  }
  document.getElementById('info-halaman').textContent = `Halaman ${halamanCatat} dari ${totalHalaman()}`;
  document.getElementById('btn-prev').disabled = halamanCatat <= 1;
  document.getElementById('btn-next').disabled = halamanCatat >= totalHalaman();
  perbaruiTotalArea();
}

// Stan akhir: hanya angka, maksimal 6 digit
document.getElementById('isi-input').addEventListener('input', e => {
  const input = e.target.closest('.in-akhir');
  if (!input) return;
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
  const tr = input.closest('tr');
  const a = ANGGOTA.find(x => x.id === tr.dataset.id);
  const m = bulanInput();
  const tersimpan = a.akhir[m] === null ? '' : String(a.akhir[m]);
  if (input.value === tersimpan) delete draft[kunci(a, m)];
  else draft[kunci(a, m)] = input.value;
  isiBarisHitung(tr);
  perbaruiTotalArea();
  perbaruiStatus();
});
// Enter = pindah ke kolom stan akhir berikutnya
document.getElementById('isi-input').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('in-akhir')) return;
  e.preventDefault();
  const semua = [...document.querySelectorAll('#isi-input .in-akhir')];
  const berikut = semua[semua.indexOf(e.target) + 1];
  if (berikut) berikut.focus();
});
document.getElementById('btn-prev').addEventListener('click', () => { if (halamanCatat > 1){ halamanCatat--; renderInput(); } });
document.getElementById('btn-next').addEventListener('click', () => { if (halamanCatat < totalHalaman()){ halamanCatat++; renderInput(); } });
document.getElementById('bulan-input').addEventListener('change', () => { halamanCatat = 1; renderInput(); });
document.getElementById('cari-anggota').addEventListener('input', () => { halamanCatat = 1; renderInput(); });
document.getElementById('isi-input').addEventListener('click', e => {
  const tb = e.target.closest('.kebab');
  if (!tb || tb.disabled) return;
  const tr = tb.closest('tr');
  const a = ANGGOTA.find(x => x.id === tr.dataset.id);
  delete draft[kunci(a, bulanInput())];
  const nilai = a.akhir[bulanInput()];
  tr.querySelector('.in-akhir').value = nilai === null ? '' : nilai;
  isiBarisHitung(tr); perbaruiTotalArea(); perbaruiStatus();
});
document.getElementById('btn-refresh').addEventListener('click', () => {
  if (Object.keys(draft).length && !confirm('Buang perubahan yang belum disimpan dan muat ulang data?')) return;
  Object.keys(draft).forEach(k => delete draft[k]);
  renderInput(); renderRekapCatat(); perbaruiStatus();
  tampilToast('Data dimuat ulang');
});
document.getElementById('btn-cetak-lembar').addEventListener('click', () => cetakHalaman('lembar'));

/* Status & simpan */
function jumlahSalah(){
  return Object.keys(draft).filter(k => {
    const [id, m] = k.split('|');
    const a = ANGGOTA.find(x => x.id === id);
    return a && hitung(a, Number(m), true).salah;
  }).length;
}
function setStatus(kelas, teks){
  const el = document.getElementById('status-simpan');
  el.className = 'status-bar ' + kelas;
  el.textContent = teks;
}
function perbaruiStatus(){
  const n = Object.keys(draft).length;
  if (n === 0){ setStatus('warn', '⚠️ Belum ada nilai stan akhir yang diisi/diubah'); return; }
  const salah = jumlahSalah();
  if (salah) setStatus('err', `❌ ${salah} stan akhir lebih kecil dari stan awal. Periksa kembali sebelum menyimpan.`);
  else setStatus('ubah', `✏️ ${n} perubahan belum disimpan`);
}
document.getElementById('btn-simpan').addEventListener('click', async () => {
  const n = Object.keys(draft).length;
  if (n === 0){ setStatus('warn', '⚠️ Belum ada nilai stan akhir yang diisi/diubah'); return; }
  if (jumlahSalah()){ perbaruiStatus(); return; }

  const kirim = Object.keys(draft).map(k => {
    const [id, m] = k.split('|');
    return { id, bulan: BULAN[Number(m)], stanAkhir: draft[k] === '' ? null : Number(draft[k]) };
  });
  if (!URL_ADMIN23){ setStatus('err', '❌ URL_ADMIN23 belum diisi.'); return; }
  if (URL_ADMIN23){
    setStatus('ubah', 'Mengirim ke server...');
    try{
      const r = await panggilGAS(URL_ADMIN23, tambahKred({ action:'simpan_stan', petugas:petugas.nama, tahun:tahunCatat, data:JSON.stringify(kirim) }));
      if (!sukesGAS(r)){ setStatus('err', '❌ ' + ((r && r.error) || 'Server menolak data.') + ' Perubahan belum tersimpan.'); return; }
    }catch(err){ setStatus('err', '❌ Server tidak dapat dihubungi. Perubahan belum tersimpan.'); return; }
  }

  Object.keys(draft).forEach(k => {
    const [id, m] = k.split('|');
    ANGGOTA.find(x => x.id === id).akhir[Number(m)] = draft[k] === '' ? null : Number(draft[k]);
    delete draft[k];
  });
  renderInput();
  renderRekapCatat();
  setStatus('ok', `✅ ${n} perubahan berhasil disimpan`);
});
window.addEventListener('beforeunload', e => {
  if (Object.keys(draft).length){ e.preventDefault(); e.returnValue = ''; }
});

/* Rekap bulanan siap cetak A4 (hanya data yang sudah disimpan) */
const IK_MATA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 5C6.5 5 2.5 9 1 12c1.5 3 5.5 7 11 7s9.5-4 11-7c-1.5-3-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"/></svg>';
const IK_PIN = '<svg class="ik-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
const tanggalPanjang = () => new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
function renderRekapCatat(){
  if (!petugas) return;
  const m = Number(document.getElementById('bulan-rekap').value);
  let totVol = 0, totHarga = 0;
  const baris = ANGGOTA.map((a, i) => {
    const h = hitung(a, m, false);
    if (h.volume !== null && !h.salah){ totVol += h.volume; totHarga += h.harga; }
    return `<tr><td>${i + 1}</td><td>${esc(a.id)}</td><td>${esc(a.nama)}</td>
      <td class="c">${h.awal}</td>
      <td class="c">${h.akhir === null ? '-' : h.akhir}</td>
      <td class="c"><span class="pil-pakai">${h.volume === null ? '-' : h.volume}</span></td>
      <td class="angka">${h.harga === null ? '-' : rp(h.harga)}</td>
      <td class="kol-aksi"><button type="button" class="mata" data-i="${i}" aria-label="Lihat detail ${esc(a.nama)}">${IK_MATA}</button></td></tr>`;
  });
  document.getElementById('isi-rekap-catat').innerHTML = ANGGOTA.length
    ? `<tr class="grup"><td colspan="8">${IK_PIN}WILAYAH ${petugas.nama.toUpperCase()}: ${petugas.wilayah}</td></tr>` + baris.join('')
    : '<tr><td colspan="8" class="kosong">Tidak ada anggota pada area ini.</td></tr>';
  document.getElementById('foot-rekap-catat').innerHTML =
    `<tr><td colspan="5">Total (${ANGGOTA.length} pelanggan)</td><td class="c">${totVol}</td><td class="angka">${rp(totHarga)}</td><td class="kol-aksi"></td></tr>`;
  const thn = new Date().getFullYear();
  document.getElementById('rk-pel').textContent = ANGGOTA.length;
  document.getElementById('rk-vol').textContent = totVol + ' m³';
  document.getElementById('rk-tag').textContent = rp(totHarga);
  document.getElementById('periode-rekap').textContent = BULAN[m];
  document.getElementById('judul-rekap').textContent = `REKAP PENCATATAN METER AIR - ${BULAN[m].toUpperCase()} ${thn}`;
  document.getElementById('petugas-rekap').textContent = `Petugas: ${petugas.nama} | ${petugas.area}`;
  document.getElementById('ttd-tempat').textContent = `${petugas.pendek}, ${tanggalPanjang()}`;
  document.getElementById('ttd-petugas').textContent = petugas.nama;
  const p = document.getElementById('peringatan-rekap');
  const belum = Object.keys(draft).length;
  p.style.display = belum ? 'block' : 'none';
  p.textContent = belum ? `⚠️ Ada ${belum} perubahan di tab Input Pencatatan yang belum disimpan. Rekap hanya memuat data yang sudah disimpan.` : '';
}
document.getElementById('isi-rekap-catat').addEventListener('click', e => {
  const tb = e.target.closest('.mata');
  if (!tb) return;
  const a = ANGGOTA[Number(tb.dataset.i)];
  const h = hitung(a, Number(document.getElementById('bulan-rekap').value), false);
  tampilToast(`${a.nama}: ${h.awal} → ${h.akhir === null ? '-' : h.akhir} | ${h.volume === null ? '-' : h.volume + ' m³'} | ${h.harga === null ? '-' : rp(h.harga)}`);
});
// Menu "Cetak / Simpan PDF"
(function(){
  const tombol = document.getElementById('btn-menu-cetak'), menu = document.getElementById('menu-cetak-isi');
  tombol.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('tampil'); });
  document.addEventListener('click', () => menu.classList.remove('tampil'));
  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    menu.classList.remove('tampil');
    cetakHalaman('rekap-catat', b.dataset.mode === 'pdf');
  });
})();

/* Lembar pencatatan (formulir kosong untuk dibawa ke lapangan) */
function renderLembar(){
  const m = bulanInput();
  const thn = new Date().getFullYear();
  const baris = ANGGOTA.map((a, i) => {
    const h = hitung(a, m, false);
    return `<tr><td>${i + 1}</td><td>${esc(a.id)}</td><td>${esc(a.nama)}</td><td class="c">${h.awal}</td><td class="c">${h.akhir === null ? '' : h.akhir}</td><td></td></tr>`;
  }).join('');
  document.getElementById('lembar-catat').innerHTML = `
    <div class="kop">
      <b class="kop-nama">HIPPAM "TIRTA KENCANA"</b>
      <span>Dusun Karangtalun, Desa Gedompol, Kec. Donorojo</span>
      <h2>LEMBAR PENCATATAN METER AIR - ${BULAN[m].toUpperCase()} ${thn}</h2>
      <p>Petugas: ${esc(petugas.nama)} | ${esc(petugas.area)}</p>
    </div>
    <table class="tabel-lembar">
      <thead><tr><th>No</th><th>ID Anggota</th><th>Nama</th><th>Stan Awal</th><th>Stan Akhir</th><th>Paraf / Ket.</th></tr></thead>
      <tbody>${baris}</tbody>
    </table>
    <div class="catatan"><p>* Tulis stan akhir (maksimal 6 digit), lalu masukkan ke menu Input Pencatatan.</p></div>`;
}

/* =====================================================================
   CETAK / SIMPAN PDF : tiap halaman mencetak bagiannya sendiri.
   Nama berkas PDF diambil dari judul dokumen saat jendela cetak dibuka.
   ===================================================================== */
function cetak(zona, namaBerkas){
  const judulAsli = document.title;
  document.body.dataset.cetak = zona;
  if (namaBerkas) document.title = namaBerkas;
  const selesai = () => {
    delete document.body.dataset.cetak;
    document.title = judulAsli;
    window.removeEventListener('afterprint', selesai);
  };
  window.addEventListener('afterprint', selesai);
  setTimeout(() => window.print(), 60);
}
function cetakHalaman(zona, pdf){
  const thn = new Date().getFullYear();
  let nama = '';
  if (zona === 'struk'){
    renderStruk();
    if (document.getElementById('btn-struk-cetak').disabled){ tampilToast('Struk hanya bisa dicetak setelah status Lunas.'); return; }
    nama = `Struk_${BULAN[Number(document.getElementById('pilih-bulan-struk').value)]}_${thn}_${DATA.id}`;
  } else if (zona === 'kartu'){
    nama = `Kartu_Anggota_${DATA.id}`;
  } else if (zona === 'rekap-anggota'){
    nama = `Rekap_Tahunan_${tahunRekap}_${DATA.id}`;
  } else if (zona === 'rekap-catat'){
    renderRekapCatat();
    nama = `Rekap_Bulanan_${BULAN[Number(document.getElementById('bulan-rekap').value)]}_${thn}_${petugas.nama}`;
  } else if (zona === 'lembar'){
    renderLembar();
    nama = `Lembar_Pencatatan_${BULAN[bulanInput()]}_${thn}_${petugas.nama}`;
  }
  if (pdf) tampilToast('Pada jendela cetak, pilih tujuan "Simpan sebagai PDF".');
  cetak(zona, nama.replace(/[^\w\-]+/g, '_'));
}
document.getElementById('bulan-rekap').addEventListener('change', renderRekapCatat);

/* =====================================================================
   BAGIAN E : DASHBOARD BENDAHARA (ADMIN 1)
   Data anggota dimuat dari server (DataAnggota) saat Admin 1 login.
   ===================================================================== */
const PER_HAL_BEND = 10;
let bendHal = 1;
let bendSemua = false;     // true saat mencetak: tampilkan semua baris
let bendDaftar = [];       // hasil penyaringan tabel (semua halaman)

const bendBulan = () => Number(document.getElementById('bend-bulan').value);

// Data satu anggota pada satu bulan
function recBend(a, m){
  const h = hitung(a, m, false);
  const ada = h.akhir !== null && !h.salah;
  const tagihan = ada ? h.harga : 0;
  const dibayar = a.dibayar[m] || 0;
  let status;
  if (!ada) status = 'belum-catat';
  else if (tagihan === 0) status = 'nol';
  else status = dibayar >= tagihan ? 'lunas' : (dibayar > 0 ? 'kurang' : 'belum');
  return { a, awal:h.awal, akhir:ada ? h.akhir : null, volume: ada ? h.volume : 0, tagihan, dibayar, status };
}
const LABEL_STATUS = {
  'lunas':       { teks:'Lunas',             kelas:'lunas' },
  'belum':       { teks:'Belum Bayar',       kelas:'belum' },
  'kurang':      { teks:'Kurang Bayar',      kelas:'belum' },
  'nol':         { teks:'Tidak ada tagihan', kelas:'nol' },
  'belum-catat': { teks:'Belum dicatat',     kelas:'nol' }
};
const badgeBend = s => `<span class="status ${LABEL_STATUS[s].kelas}">${LABEL_STATUS[s].teks}</span>`;

function tampilToast(teks){
  const t = document.getElementById('toast');
  t.textContent = teks;
  t.style.display = 'block';
  clearTimeout(tampilToast.waktu);
  tampilToast.waktu = setTimeout(() => { t.style.display = 'none'; }, 2600);
}

async function mulaiBendahara(){
  if (!URL_BASE_ANGGOTA) throw new Error('URL_BASE_ANGGOTA belum diisi.');
  // Data anggota dan BKU diminta BERSAMAAN (sebelumnya berurutan, jadi waktu tunggu dijumlahkan)
  const [r] = await Promise.all([panggilGAS(URL_BASE_ANGGOTA, tambahKred({ action:'daftar_anggota' })), muatBKUServer()]);
  if (!sukesGAS(r)) throw new Error((r && r.error) || 'Data anggota ditolak server.');
  ANGGOTA_SEMUA = (r.data || []).map(adaptAnggota);
  document.getElementById('nama-bend').textContent = (kredAdmin && kredAdmin.nama) || 'Bendahara';
  tahunBend = Number(r.tahun) || new Date().getFullYear();
  const tahun = new Date().getFullYear();
  const sel = document.getElementById('bend-bulan');
  sel.innerHTML = BULAN.map((n, i) => `<option value="${i}">${n} ${tahun}</option>`).join('');
  sel.value = bulanBerjalan;                           // tagihan bulan berjalan sudah dirilis tanggal 1
  document.getElementById('bend-status').value = 'semua';
  document.getElementById('bend-tanggal').textContent =
    new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  bendHal = 1;
  bendSemua = false;
  document.getElementById('bku-periode').value = '';
  isiPilihTahun('rekap-tahun'); isiPilihTahun('lap-tahun');
  renderBend();
  tampilView('bv-dash');
  pindahLayar('v-bend');
}

function renderBend(){
  const m = bendBulan();
  const recs = ANGGOTA_SEMUA.map(a => recBend(a, m));
  const totTagihan = recs.reduce((s, r) => s + r.tagihan, 0);
  const lunas = recs.filter(r => r.status === 'lunas').length;
  const belum = recs.filter(r => r.status === 'belum' || r.status === 'kurang').length;
  const dasar = lunas + belum;
  const pctLunas = dasar ? Math.round(lunas / dasar * 100) : 0;
  const pctBelum = dasar ? 100 - pctLunas : 0;

  document.getElementById('bs-total').textContent = recs.length;
  const pakai = recs.reduce((s, r) => s + (r.volume || 0), 0);
  document.getElementById('bs-pakai').textContent = pakai.toLocaleString('id-ID') + ' m³';
  document.getElementById('bs-pakai-sub').textContent = recs.length ? `rata-rata ${(pakai / recs.length).toLocaleString('id-ID', { maximumFractionDigits:1 })} m³/anggota` : '';
  const tercatat = recs.filter(r => r.status !== 'belum-catat').length;
  document.getElementById('bs-pakai-sub2').textContent = `${tercatat} dari ${recs.length} anggota tercatat`;
  document.getElementById('bs-tagihan').textContent = rp(totTagihan);
  document.getElementById('bs-tagihan-sub').textContent = `${recs.filter(r => r.tagihan > 0).length} anggota ditagih`;
  const dibayar = recs.reduce((s, r) => s + Math.min(r.dibayar || 0, r.tagihan), 0);
  document.getElementById('bs-terbayar').textContent = totTagihan ? Math.round(dibayar / totTagihan * 100) + '%' : '-';
  document.getElementById('bs-terbayar-sub').textContent = totTagihan ? `${rp(dibayar)} dari ${rp(totTagihan)}` : 'Belum ada tagihan';
  document.getElementById('bs-lunas').textContent = lunas;
  document.getElementById('bs-belum').textContent = belum;
  document.getElementById('bs-lunas-pct').textContent = dasar ? `(${pctLunas}%)` : '';
  document.getElementById('bs-belum-pct').textContent = dasar ? `(${pctBelum}%)` : '';
  document.getElementById('sb-lunas-bar').style.width = pctLunas + '%';
  document.getElementById('sb-belum-bar').style.width = pctBelum + '%';
  document.querySelectorAll('.jb-bulan').forEach(e => { e.textContent = BULAN[m] + ' ' + new Date().getFullYear(); });

  // Perubahan total tagihan dibanding bulan sebelumnya
  const dEl = document.getElementById('bs-tagihan-delta');
  const prev = m > 0 ? ANGGOTA_SEMUA.reduce((s, a) => s + recBend(a, m - 1).tagihan, 0) : 0;
  if (prev > 0){
    const d = Math.round((totTagihan - prev) / prev * 100);
    dEl.className = 'delta ' + (d >= 0 ? 'naik' : 'turun');
    dEl.textContent = `${d >= 0 ? '↑' : '↓'} ${Math.abs(d)}%`;
  } else { dEl.className = 'delta'; dEl.textContent = ''; }

  renderBendKeuangan(m);
  renderBendGrafik();
  renderBendDonut(pctLunas);
  renderBendTabel();
}

function renderBendGrafik(){
  const tahun = new Date().getFullYear(), mKini = new Date().getMonth();
  const label = BULAN.map(n => n.slice(0, 3));
  const nilai = BULAN.map((n, i) => i <= mKini ? ANGGOTA_SEMUA.reduce((s, a) => s + recBend(a, i).volume, 0) : null);
  const ada = nilai.filter(v => v !== null);
  const W = 640, H = 250, L = 52, R = 16, T = 36, B = 34;
  const kasar = Math.max(Math.max(...ada), 4) * 1.15 / 4;
  const p = Math.pow(10, Math.floor(Math.log10(kasar)));
  const langkah = Math.ceil(kasar / p) * p;
  const yMax = langkah * 4;
  const x = i => L + (i + 0.5) * (W - L - R) / 12;
  const y = v => T + (H - T - B) * (1 - v / yMax);

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Grafik pemakaian air 12 bulan ${tahun}">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B63D1" stop-opacity=".35"/><stop offset="1" stop-color="#0B63D1" stop-opacity=".02"/>
    </linearGradient></defs>`;
  for (let k = 0; k <= 4; k++){
    const v = langkah * k, yy = y(v);
    svg += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="#DCE9F7"/>
            <text x="${L - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#4D6586">${v.toLocaleString('id-ID')}</text>`;
  }
  label.forEach((lb, i) => { svg += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#4D6586">${lb}</text>`; });
  const titik = ada.map((v, i) => [x(i), y(v)]);
  const garis = titik.map((t, i) => (i ? 'L' : 'M') + t[0] + ' ' + t[1]).join(' ');
  svg += `<path d="${garis} L${titik[titik.length - 1][0]} ${H - B} L${titik[0][0]} ${H - B} Z" fill="url(#gArea)"/>
          <path d="${garis}" fill="none" stroke="#0B63D1" stroke-width="2.5"/>`;
  titik.forEach((t, i) => {
    svg += `<circle cx="${t[0]}" cy="${t[1]}" r="4" fill="#0B63D1" stroke="#fff" stroke-width="2"><title>${BULAN[i]}: ${ada[i].toLocaleString('id-ID')} m³</title></circle>
            <text x="${t[0]}" y="${t[1] - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#12294A">${ada[i].toLocaleString('id-ID')}</text>`;
  });
  svg += '</svg>';
  document.getElementById('grafik-isi').innerHTML = svg;
  document.getElementById('grafik-tahun').textContent = `12 bulan · ${tahun}`;

  const berisi = ada.filter(v => v > 0);
  const rata = berisi.length ? Math.round(berisi.reduce((s, v) => s + v, 0) / berisi.length) : 0;
  document.getElementById('bend-rata').textContent = `${rata.toLocaleString('id-ID')} m³ / bulan`;
}

/* Kartu keuangan, transaksi kas terakhir, dan tunggakan terbesar (dashboard) */
function renderBendKeuangan(m){
  const tahun = new Date().getFullYear();
  // Saldo bulan lalu + Penerimaan - Pengeluaran = Saldo akhir. Transaksi "Saldo Awal" dihitung sebagai saldo awal, bukan penerimaan.
  const ym = `${tahun}-${String(m + 1).padStart(2, '0')}`;
  const bln = BKU.filter(t => t.tgl.slice(0, 7) === ym);
  const net = t => t.masuk - t.keluar;
  const awal = BKU.filter(t => t.tgl.slice(0, 7) < ym).reduce((s, t) => s + net(t), 0)
             + bln.filter(t => t.kat === KAT_SALDO_AWAL).reduce((s, t) => s + net(t), 0);
  const masuk = bln.filter(t => t.kat !== KAT_SALDO_AWAL).reduce((s, t) => s + t.masuk, 0);
  const keluar = bln.filter(t => t.kat !== KAT_SALDO_AWAL).reduce((s, t) => s + t.keluar, 0);
  const saldoAkhir = awal + masuk - keluar, selisih = masuk - keluar;
  const rpS = v => (v < 0 ? '-' : '') + rp(Math.abs(v));
  const per = ANGGOTA_SEMUA.map(a => {
    let jml = 0, bulan = 0;
    for (let i = 0; i <= m; i++){
      const r = recBend(a, i);
      if (r.status === 'belum' || r.status === 'kurang'){ jml += r.tagihan - r.dibayar; bulan++; }
    }
    return { a, jml, bulan };
  }).filter(x => x.jml > 0).sort((x, y) => y.jml - x.jml);
  const totTunggak = per.reduce((s, x) => s + x.jml, 0);
  document.getElementById('bk-awal').textContent = rpS(awal);
  document.getElementById('bk-awal-lbl').textContent = m === 0 ? 'Saldo Awal Tahun' : 'Saldo Bulan Lalu';
  document.getElementById('bk-saldo').textContent = rpS(saldoAkhir);
  document.getElementById('bk-akhir-lbl').textContent = m === new Date().getMonth() ? 'Saldo Saat Ini' : 'Saldo Akhir ' + BULAN[m];
  document.getElementById('bk-surplus').textContent = selisih > 0 ? `Surplus +${rp(selisih)} di ${BULAN[m]}` : selisih < 0 ? `Defisit -${rp(-selisih)} di ${BULAN[m]}` : `Seimbang di ${BULAN[m]}`;
  document.getElementById('bk-masuk').textContent = rp(masuk);
  document.getElementById('bk-keluar').textContent = rp(keluar);
  document.getElementById('bk-tunggak').textContent = rp(totTunggak);
  document.getElementById('bk-tunggak-sub').textContent = per.length ? `${per.length} anggota · s.d. ${BULAN[m]}` : 'Tidak ada tunggakan';
  const akhir = BKU.slice().sort((x, y) => y.tgl.localeCompare(x.tgl) || Number(y.id) - Number(x.id)).slice(0, 5);
  document.getElementById('dash-bku').innerHTML = akhir.length ? akhir.map(t => {
    const mk = t.masuk > 0 && t.keluar === 0;
    return `<div class="dash-item"><span class="ik ${mk ? 'm' : 'k'}">${mk ? '↑' : '↓'}</span>
      <div class="tx"><b>${esc(t.ket || t.kat)}</b><small>${tglIndo(t.tgl)} · ${esc(t.kat)}</small></div>
      <span class="nom ${mk ? 'm' : 'k'}">${mk ? '+' : '-'}${rp(mk ? t.masuk : t.keluar)}</span></div>`;
  }).join('') : '<div class="dash-kosong">Belum ada transaksi kas.</div>';
  document.getElementById('dash-tunggak').innerHTML = per.length ? per.slice(0, 5).map(x => `
    <div class="dash-item"><span class="ik t">!</span>
      <div class="tx"><b>${esc(x.a.nama)}</b><small>${esc(x.a.id)} · ${x.bulan} bulan</small></div>
      <span class="nom t">${rp(x.jml)}</span></div>`).join('') : '<div class="dash-kosong">Tidak ada tunggakan. 🎉</div>';
}

function renderBendDonut(pct){
  const K = 2 * Math.PI * 52;
  document.getElementById('donut-isi').innerHTML = `
    <svg viewBox="0 0 140 140" role="img" aria-label="Tingkat pembayaran ${pct}%">
      <circle cx="70" cy="70" r="52" fill="none" stroke="#D6E7F9" stroke-width="14"/>
      <circle cx="70" cy="70" r="52" fill="none" stroke="#0B63D1" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="${K * pct / 100} ${K}" transform="rotate(-90 70 70)"/>
      <text x="70" y="78" text-anchor="middle" font-size="26" font-weight="800" fill="#12294A">${pct}%</text>
    </svg>`;
}

function renderBendTabel(){
  const m = bendBulan();
  const tahun = new Date().getFullYear();
  const filter = document.getElementById('bend-status').value;
  bendDaftar = ANGGOTA_SEMUA.slice().sort(urutId).map(a => recBend(a, m)).filter(r => filter === 'semua' || r.status === filter);

  const totalHal = Math.max(1, Math.ceil(bendDaftar.length / PER_HAL_BEND));
  if (bendHal > totalHal) bendHal = totalHal;
  const mulai = bendSemua ? 0 : (bendHal - 1) * PER_HAL_BEND;
  const baris = bendSemua ? bendDaftar : bendDaftar.slice(mulai, mulai + PER_HAL_BEND);

  document.getElementById('isi-bend').innerHTML = baris.length ? baris.map((r, i) => `
    <tr>
      <td class="c">${mulai + i + 1}</td><td>${esc(r.a.id)}</td><td>${esc(r.a.nama)}</td>
      <td class="c">${r.awal}</td><td class="c">${r.akhir === null ? '-' : r.akhir}</td><td class="c">${r.volume}</td>
      <td class="c">${rp(r.tagihan)}</td><td class="c">${badgeBend(r.status)}</td>
      <td class="c no-print"><button class="btn-detail" data-idx="${mulai + i}">Detail</button></td>
    </tr>`).join('') : '<tr><td colspan="9" class="kosong">Tidak ada data untuk filter ini.</td></tr>';

  document.getElementById('bend-info').textContent = `Halaman ${bendHal} dari ${totalHal}`;
  document.getElementById('bend-prev').disabled = bendHal <= 1;
  document.getElementById('bend-next').disabled = bendHal >= totalHal;
  document.getElementById('bend-judul').textContent = `REKAPITULASI TAGIHAN AIR - ${BULAN[m].toUpperCase()} ${tahun}`;
  document.getElementById('bend-sub').textContent =
    `Filter status: ${document.getElementById('bend-status').selectedOptions[0].textContent} | Jumlah anggota: ${bendDaftar.length}`;
}

/* Interaksi bendahara */
document.getElementById('bend-bulan').addEventListener('change', () => { bendHal = 1; renderBend(); });
document.getElementById('bend-status').addEventListener('change', () => { bendHal = 1; renderBendTabel(); });
document.getElementById('bend-prev').addEventListener('click', () => { if (bendHal > 1){ bendHal--; renderBendTabel(); } });
document.getElementById('bend-next').addEventListener('click', () => { bendHal++; renderBendTabel(); });
document.getElementById('btn-lonceng').addEventListener('click', () => tampilToast('Belum ada pemberitahuan baru.'));

document.getElementById('nav-bend').addEventListener('click', e => {
  const tombol = e.target.closest('button[data-menu]');
  if (!tombol) return;
  const menu = tombol.dataset.menu;
  tutupDrawer();
  if (menu === 'Keluar') keluar();
  else if (tombol.dataset.view) tampilView(tombol.dataset.view);
  else tampilToast(`Menu "${menu}" akan dilengkapi pada tahap berikutnya.`);
});

// Detail tagihan per anggota
document.getElementById('isi-bend').addEventListener('click', e => {
  const tombol = e.target.closest('.btn-detail');
  if (!tombol) return;
  const r = bendDaftar[Number(tombol.dataset.idx)];
  const m = bendBulan();
  const admin = r.volume > 0 ? ADMIN : 0;
  const baris = (k, v) => `<div class="baris-detail"><span>${k}</span><b>${v}</b></div>`;
  document.getElementById('modal-judul').textContent = `Detail Tagihan - ${BULAN[m]}`;
  document.getElementById('modal-badan').innerHTML =
    baris('ID Anggota', esc(r.a.id)) + baris('Nama', esc(r.a.nama)) +
    baris('Stan Awal - Akhir', `${r.awal} - ${r.akhir === null ? '-' : r.akhir}`) +
    baris('Pemakaian', `${r.volume} m³`) + baris('Tarif / m³', rp(r.volume > 0 ? tarifUntuk(r.a.id) : 0)) +
    baris('Tagihan Air', rp(r.tagihan - admin)) + baris('Biaya Admin', rp(admin)) +
    baris('Total Tagihan', rp(r.tagihan)) + baris('Sudah Dibayar', rp(r.dibayar)) +
    baris('Tunggakan', rp(Math.max(r.tagihan - r.dibayar, 0))) + baris('Status', LABEL_STATUS[r.status].teks);
  document.getElementById('modal-bend').classList.remove('konfirmasi');
  document.getElementById('modal-bend').classList.add('tampil');
});
document.getElementById('modal-tutup').addEventListener('click', () => document.getElementById('modal-bend').classList.remove('tampil'));
document.getElementById('modal-bend').addEventListener('click', e => { if (e.target.id === 'modal-bend') e.target.classList.remove('tampil'); });

// Cetak: tampilkan semua baris hasil filter, lalu kembali ke tampilan per halaman
document.getElementById('btn-cetak-bend').addEventListener('click', () => {
  bendSemua = true;
  renderBendTabel();
  window.print();
});
window.addEventListener('afterprint', () => {
  if (bendSemua){ bendSemua = false; renderBendTabel(); }
});

// Export CSV (bisa dibuka di Excel)
document.getElementById('btn-export-bend').addEventListener('click', () => {
  const m = bendBulan();
  const kepala = ['No','ID Anggota','Nama Anggota','Meter Awal','Meter Akhir','Pemakaian (m3)','Total Tagihan','Dibayar','Status'];
  const isi = bendDaftar.map((r, i) => [i + 1, r.a.id, r.a.nama, r.awal, r.akhir === null ? '' : r.akhir, r.volume, r.tagihan, r.dibayar, LABEL_STATUS[r.status].teks]);
  const csv = [kepala, ...isi].map(b => b.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap-tagihan-${BULAN[m].toLowerCase()}-${new Date().getFullYear()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

/* =====================================================================
   BENDAHARA : MENU, BKU, REKAP PEMAKAIAN AIR, LAPORAN 1 TAHUNAN
   ===================================================================== */
function tampilView(id){
  document.querySelectorAll('#v-bend .bview').forEach(v => v.classList.toggle('aktif', v.id === id));
  document.querySelectorAll('#nav-bend button[data-view]').forEach(b => b.classList.toggle('aktif', b.dataset.view === id));
  if (id === 'bv-bku') renderBKU();
  else if (id === 'bv-rekap') renderRekapAir();
  else if (id === 'bv-lap') renderLaporan();
  else if (id === 'bv-anggota') renderDataAnggota();
  else if (id === 'bv-bayar') renderBayar();
  const tb = document.querySelector('#nav-bend button[data-view="' + id + '"]');
  if (tb) document.getElementById('topbar-judul').textContent = tb.dataset.menu;
  tutupDrawer();
  window.scrollTo(0, 0);
}

const angka = n => Number(n).toLocaleString('id-ID');
const tglIndo = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const tglCetakTeks = () => 'Karangtalun, ' + new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
function isiTglCetak(){ document.querySelectorAll('#v-bend .tgl-cetak').forEach(p => { p.textContent = tglCetakTeks(); }); }

/* =====================================================================
   BENDAHARA : DATA ANGGOTA (per area) & PEMBAYARAN (validasi status Lunas)
   ===================================================================== */
let tahunBend = new Date().getFullYear();
const areaAnggota = id => (/^(JBK|JBE|JBM)/i.test(String(id)) ? 'Jlubang' : 'Karangtalun');
const noUrut = id => {          // 3 digit tengah ID (…-001-…) = no urut/registrasi
  const s = String(id || ''), p = s.split('-');
  if (p.length >= 3 && /^\d+$/.test(p[1])) return Number(p[1]);
  const m = s.match(/-(\d{3})(?:-|$)/) || s.match(/(\d{3})/);
  return m ? Number(m[1]) : 1e9;
};
const urutId = (a, b) => noUrut(a.id) - noUrut(b.id) || String(a.id).localeCompare(String(b.id), 'id', { numeric:true });
const cocokCari = (a, q) => !q || String(a.id).toLowerCase().indexOf(q) >= 0 || String(a.nama).toLowerCase().indexOf(q) >= 0;

function renderDataAnggota(){
  const q = document.getElementById('ang-cari').value.trim().toLowerCase();
  const kel = { Karangtalun:[], Jlubang:[] };
  ANGGOTA_SEMUA.slice().sort(urutId).forEach(a => { if (cocokCari(a, q)) kel[areaAnggota(a.id)].push(a); });
  const total = ANGGOTA_SEMUA.length, nJ = ANGGOTA_SEMUA.filter(a => areaAnggota(a.id) === 'Jlubang').length;
  document.getElementById('ang-ringkas').innerHTML =
    `<span class="chip-ang">Total <b>${total}</b> anggota</span><span class="chip-ang">Area Karangtalun <b>${total - nJ}</b></span><span class="chip-ang">Area Jlubang <b>${nJ}</b></span>`;
  const ket = { Karangtalun:'ID selain JBK, JBE, JBM', Jlubang:'ID berawalan JBK, JBE, JBM' };
  document.getElementById('ang-isi').innerHTML = ['Karangtalun', 'Jlubang'].map(ar => `
    <div class="ang-blok">
      <h3>Area ${ar} <small>${ket[ar]} · ${kel[ar].length} anggota</small></h3>
      <div class="tabel-wrap"><table class="tbl-ang"><thead><tr><th class="c">No</th><th>Nama</th><th>ID Anggota</th></tr></thead><tbody>
        ${kel[ar].length ? kel[ar].map((a, i) => `<tr><td class="c">${i + 1}</td><td>${esc(a.nama)}</td><td><b>${esc(a.id)}</b></td></tr>`).join('')
          : '<tr><td colspan="3" class="kosong">Tidak ada data.</td></tr>'}
      </tbody></table></div>
    </div>`).join('');
}
document.getElementById('ang-cari').addEventListener('input', renderDataAnggota);

/* ---------- Pembayaran: tampilkan isi sel status (AB-AM) dan validasi Lunas ---------- */
const BYR_PER_HAL = 15;
let byrHal = 1, byrDaftar = [];
function selBayar(a, m){          // isi sel apa adanya + kelas warna + apakah bisa diketuk
  const nilai = a.statusRaw ? a.statusRaw[m] : '', lab = a.label ? a.label[m] : 'belum_ada';
  if (lab === 'lunas') return { teks:'1', kls:'ok', klik:false };
  if (lab === 'belum_bayar') return { teks:angka(nilai), kls:'belum', klik:true };
  if (lab === 'kurang') return { teks:angka(nilai), kls:'kurang', klik:true };
  if (String(nilai).trim() === '-') return { teks:'-', kls:'nol', klik:false };
  return { teks:'0', kls:'nol', klik:false };
}
function renderBayar(){
  document.getElementById('byr-tahun').textContent = '· Tahun ' + tahunBend;
  document.getElementById('byr-kepala').innerHTML = '<tr><th>ID Anggota</th><th>Nama Anggota</th>' + BULAN.map(n => `<th class="c">${n.slice(0, 3)}</th>`).join('') + '</tr>';
  const area = document.getElementById('byr-area').value, saring = document.getElementById('byr-saring').value;
  const q = document.getElementById('byr-cari').value.trim().toLowerCase();
  byrDaftar = ANGGOTA_SEMUA.slice().sort(urutId).filter(a => (area === 'semua' || areaAnggota(a.id) === area) && cocokCari(a, q)
    && (saring !== 'belum' || a.label.some(l => l === 'belum_bayar' || l === 'kurang')));
  const halaman = Math.max(Math.ceil(byrDaftar.length / BYR_PER_HAL), 1);
  byrHal = Math.min(Math.max(byrHal, 1), halaman);
  const mulai = (byrHal - 1) * BYR_PER_HAL;
  document.getElementById('byr-isi').innerHTML = byrDaftar.length
    ? byrDaftar.slice(mulai, mulai + BYR_PER_HAL).map((a, i) => `<tr><td><b>${esc(a.id)}</b><small class="byr-nama">${esc(a.nama)}</small></td><td>${esc(a.nama)}</td>${
        BULAN.map((n, m) => { const c = selBayar(a, m);
          return `<td class="c byr-sel ${c.kls}"${c.klik ? ` data-i="${mulai + i}" data-m="${m}" role="button" tabindex="0" title="Ketuk untuk menandai Lunas"` : ''}>${c.teks}</td>`; }).join('')}</tr>`).join('')
    : `<tr><td colspan="14" class="kosong">Tidak ada anggota yang cocok.</td></tr>`;
  document.getElementById('byr-info').textContent = `Halaman ${byrHal} dari ${halaman} · ${byrDaftar.length} anggota`;
  document.getElementById('byr-prev').disabled = byrHal <= 1;
  document.getElementById('byr-next').disabled = byrHal >= halaman;
}
['byr-area', 'byr-saring'].forEach(id => document.getElementById(id).addEventListener('change', () => { byrHal = 1; renderBayar(); }));
document.getElementById('byr-cari').addEventListener('input', () => { byrHal = 1; renderBayar(); });
document.getElementById('byr-prev').addEventListener('click', () => { byrHal--; renderBayar(); });
document.getElementById('byr-next').addEventListener('click', () => { byrHal++; renderBayar(); });
function pilihSelBayar(e){
  const td = e.target.closest('td.byr-sel[data-m]');
  if (td) konfirmasiLunas(byrDaftar[Number(td.dataset.i)], Number(td.dataset.m));
}
document.getElementById('byr-isi').addEventListener('click', pilihSelBayar);
document.getElementById('byr-isi').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pilihSelBayar(e); } });

function konfirmasiLunas(a, m){
  if (!a) return;
  const baris = (k, v) => `<div class="baris-detail"><span>${k}</span><b>${v}</b></div>`;
  const modal = document.getElementById('modal-bend');
  document.getElementById('modal-judul').textContent = 'Tandai Lunas';
  document.getElementById('modal-badan').innerHTML =
    baris('ID Anggota', esc(a.id)) + baris('Nama', esc(a.nama)) + baris('Bulan', BULAN[m] + ' ' + tahunBend) +
    baris('Tagihan', rp(a.rp[m])) + baris('Isi sel sekarang', angka(a.statusRaw[m])) +
    `<p class="byr-peringatan">Sel status di sheet DataAnggota akan diganti menjadi <b>1</b> (Lunas). Rumus atau angka cicilan di sel itu ikut tergantikan.</p>
     <p class="pesan-modal" id="byr-pesan"></p>
     <div class="aksi"><button class="btn garis" id="byr-batal" type="button">Batal</button><button class="btn hijau" id="byr-ya" type="button">Ya, tandai Lunas</button></div>`;
  modal.classList.add('konfirmasi'); modal.classList.add('tampil');
  document.getElementById('byr-batal').onclick = () => modal.classList.remove('tampil');
  document.getElementById('byr-ya').onclick = async () => {
    const ya = document.getElementById('byr-ya'), pesan = document.getElementById('byr-pesan');
    if (!URL_BASE_ANGGOTA){ pesan.textContent = 'URL_BASE_ANGGOTA belum diisi.'; return; }
    ya.disabled = true; pesan.textContent = 'Menyimpan ke sheet...';
    try{
      const r = await panggilGAS(URL_BASE_ANGGOTA, tambahKred({ action:'set_status', id:a.id, bulan:m, tahun:tahunBend }));
      if (!sukesGAS(r)){ pesan.textContent = (r && r.error) || 'Server menolak perubahan.'; ya.disabled = false; return; }
    }catch(err){ pesan.textContent = (err && err.message) || 'Server tidak terjangkau.'; ya.disabled = false; return; }
    a.statusRaw[m] = 1; a.label[m] = 'lunas'; a.dibayar[m] = a.rp[m];       // perbarui tampilan setelah server sukses
    modal.classList.remove('tampil');
    renderBayar(); renderBend();
    tampilToast(`${a.nama}: ${BULAN[m]} ditandai Lunas.`);
  };
}

/* ---------- Grafik batang (SVG buatan sendiri) ----------
   o: { kategori:[], seri:[{nama, warna, nilai:[], kanan:bool}], fmtKiri, fmtKanan, minKiri }  */
function skalaTick(maks, n){
  const kasar = Math.max(maks, 1) * 1.1 / n;
  const p = Math.pow(10, Math.floor(Math.log10(kasar)));
  const f = kasar / p;
  const langkah = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  return { langkah, yMax: langkah * n };
}
function grafikBatang(o){
  const W = 640, H = 270, L = 52, R = o.fmtKanan ? 56 : 14, T = 14, B = 34, N = 4;
  const kiri = o.seri.filter(s => !s.kanan), kanan = o.seri.filter(s => s.kanan);
  const maksDari = arr => Math.max(1, ...arr.map(s => Math.max(0, ...s.nilai)));
  const sk = skalaTick(maksDari(kiri), N);
  const sr = kanan.length ? skalaTick(maksDari(kanan), N) : null;
  const lebarBand = (W - L - R) / o.kategori.length;
  const lebarBatang = Math.min(16, lebarBand * 0.7 / o.seri.length);
  const y = (v, s) => T + (H - T - B) * (1 - v / s.yMax);
  let svg = '<svg class="grafik-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Grafik') + '">';
  for (let k = 0; k <= N; k++){
    const yy = y(sk.langkah * k, sk);
    svg += '<line x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy + '" stroke="#DCE9F7"/>' +
      '<text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#4D6586">' + o.fmtKiri(sk.langkah * k) + '</text>';
    if (sr) svg += '<text x="' + (W - R + 8) + '" y="' + (yy + 4) + '" font-size="11" fill="#4D6586">' + o.fmtKanan(sr.langkah * k) + '</text>';
  }
  o.kategori.forEach((nm, i) => {
    const x0 = L + i * lebarBand + (lebarBand - lebarBatang * o.seri.length) / 2;
    o.seri.forEach((s, j) => {
      const sc = s.kanan ? sr : sk;
      const v = s.nilai[i] || 0;
      const yy = y(v, sc);
      const tinggi = Math.max(0, H - B - yy);
      svg += '<rect x="' + (x0 + j * lebarBatang) + '" y="' + yy + '" width="' + (lebarBatang - 1) + '" height="' + tinggi + '" rx="3" fill="' + s.warna + '"><title>' +
        nm + ' - ' + s.nama + ': ' + (s.kanan ? o.fmtKanan(v) : o.fmtKiri(v)) + '</title></rect>';
    });
    svg += '<text x="' + (L + (i + 0.5) * lebarBand) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#12294A">' + nm + '</text>';
  });
  return svg + '</svg>';
}
function donatDua(pct, label){
  const K = 2 * Math.PI * 52, hijau = K * pct / 100;
  return '<svg viewBox="0 0 140 140" role="img" aria-label="' + label + ' ' + pct + ' persen">' +
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#FFD9B3" stroke-width="16"/>' +
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#17A672" stroke-width="16" stroke-dasharray="' + hijau + ' ' + K + '" transform="rotate(-90 70 70)"/>' +
    '<text x="70" y="78" text-anchor="middle" font-size="26" font-weight="800" fill="#12294A">' + pct + '%</text></svg>';
}
const BLN3 = BULAN.map(n => n.slice(0, 3));
const juta = v => (v / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';

/* ---------- Data pemakaian air per bulan (sumber: data pencatat) ---------- */
const ANGGOTA_TAHUN = {}, tahunDimuat = {};     // data anggota tahun selain tahun berjalan (dimuat sesuai kebutuhan)
const anggotaUntuk = tahun => tahun === new Date().getFullYear() ? ANGGOTA_SEMUA : (ANGGOTA_TAHUN[tahun] || null);
async function muatTahunLain(tahun, ulang){
  if (tahunDimuat[tahun]) return;
  tahunDimuat[tahun] = true;
  tampilToast('Memuat data tahun ' + tahun + '...');
  try{
    const r = await panggilGAS(URL_BASE_ANGGOTA, tambahKred({ action:'daftar_anggota', tahun:tahun }));
    ANGGOTA_TAHUN[tahun] = (sukesGAS(r) && Number(r.tahun) === tahun) ? (r.data || []).map(adaptAnggota) : [];
  }catch(err){ ANGGOTA_TAHUN[tahun] = []; }
  ulang();
}
function dataAir(tahun){
  const daftar = anggotaUntuk(tahun);
  return BULAN.map((nama, m) => {
    if (!daftar) return { nama, vol:0, tagihan:0, bayar:0, dicatat:false, status:'-' };
    const recs = daftar.map(a => recBend(a, m));
    const dicatat = recs.some(r => r.status !== 'belum-catat');
    const vol = recs.reduce((s, r) => s + r.volume, 0);
    const tagihan = recs.reduce((s, r) => s + r.tagihan, 0);
    const bayar = recs.reduce((s, r) => s + Math.min(r.dibayar, r.tagihan), 0);
    let status = '-';
    if (dicatat) status = tagihan === 0 ? 'Tidak ada tagihan' : (bayar >= tagihan ? 'Lunas' : 'Belum Lunas');
    return { nama, vol, tagihan, bayar, dicatat, status };
  });
}
const badgeLaporan = s => '<span class="status ' + (s === 'Lunas' ? 'lunas' : s === 'Belum Lunas' ? 'belum' : 'nol') + '">' + (s === 'Lunas' ? '✓ ' : '') + s + '</span>';

/* ---------- BKU (Buku Kas Umum) ---------- */
const PER_HAL_BKU = 5;
let BKU = [];
let bkuHal = 1;
let bkuSemua = false;
let bkuEditId = null;

function simpanBKULokal(){ /* BKU disimpan di server (GAS), bukan di browser */ }
function muatBKU(){ BKU = []; }
function normBKU(r, i){
  return { id: r.id !== undefined ? r.id : i + 1, tgl:String(r.tgl).slice(0, 10), ket:String(r.ket || ''),
           kat:String(r.kat || 'Lainnya'), masuk:Number(r.masuk) || 0, keluar:Number(r.keluar) || 0 };
}
async function muatBKUServer(){
  if (!URL_ADMIN1){ tampilToast('URL_ADMIN1 belum diisi.'); return false; }
  try{
    const r = await panggilGAS(URL_ADMIN1, tambahKred({ action:'bku_list' }));
    const arr = Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : null);
    if (!arr){ tampilToast((r && r.error) || 'Server BKU menolak permintaan.'); return false; }
    BKU = arr.map(normBKU);
    return true;
  }catch(err){ tampilToast('Server BKU tidak terjangkau.'); return false; }
}
const tahunTersedia = () => {
  const s = new Set([new Date().getFullYear()]);
  BKU.forEach(t => s.add(Number(t.tgl.slice(0, 4))));
  return Array.from(s).sort((a, b) => b - a);
};
function isiPilihTahun(id){
  const sel = document.getElementById(id);
  const lama = sel.value;
  sel.innerHTML = tahunTersedia().map(y => '<option value="' + y + '">' + y + '</option>').join('');
  sel.value = lama && tahunTersedia().map(String).indexOf(lama) >= 0 ? lama : String(new Date().getFullYear());
}
const KAT_SALDO_AWAL = 'Saldo Awal';   // ikut menghitung saldo, TIDAK dihitung sebagai pemasukan periode
function saldoKumulatif(){
  const urut = BKU.slice().sort((a, b) => a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : a.id - b.id);
  let s = 0; const peta = {};
  urut.forEach(t => { s += t.masuk - t.keluar; peta[t.id] = s; });
  return { urut, peta };
}
function barisBKU(){
  const per = document.getElementById('bku-periode').value;
  const q = document.getElementById('bku-cari').value.trim().toLowerCase();
  const kat = document.getElementById('bku-kat').value;
  return BKU.filter(t => t.tgl.slice(0, 7) === per &&
      (!kat || t.kat === kat) && (!q || t.ket.toLowerCase().indexOf(q) >= 0 || t.kat.toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : b.id - a.id);
}
function isiPeriodeBKU(){
  const sel = document.getElementById('bku-periode');
  const lama = sel.value;
  let h = '';
  tahunTersedia().slice().reverse().forEach(y => {
    BULAN.forEach((nm, i) => { h += '<option value="' + y + '-' + String(i + 1).padStart(2, '0') + '">' + nm + ' ' + y + '</option>'; });
  });
  sel.innerHTML = h;
  if (lama) sel.value = lama; else sel.selectedIndex = -1;
}
function renderBKU(){
  isiPeriodeBKU();
  const inp = document.getElementById('bku-periode');
  if (!inp.value){
    const akhir = BKU.map(t => t.tgl.slice(0, 7)).sort().pop();
    inp.value = akhir || (new Date().getFullYear() + '-' + String(bulanBerjalan + 1).padStart(2, '0'));
  }
  const per = inp.value;
  const { urut, peta } = saldoKumulatif();
  const bulanIni = BKU.filter(t => t.tgl.slice(0, 7) === per);
  const transaksiBulan = bulanIni.filter(t => t.kat !== KAT_SALDO_AWAL);
  const masuk = transaksiBulan.reduce((s, t) => s + t.masuk, 0);
  const keluar = transaksiBulan.reduce((s, t) => s + t.keluar, 0);
  const saldo = urut.filter(t => t.tgl.slice(0, 7) <= per).reduce((s, t) => s + t.masuk - t.keluar, 0);
  document.getElementById('kas-masuk').textContent = rp(masuk);
  document.getElementById('kas-keluar').textContent = rp(keluar);
  document.getElementById('kas-saldo').textContent = rp(saldo);

  const semua = barisBKU();
  const total = Math.max(1, Math.ceil(semua.length / PER_HAL_BKU));
  if (bkuHal > total) bkuHal = total;
  const mulai = bkuSemua ? 0 : (bkuHal - 1) * PER_HAL_BKU;
  const tampil = bkuSemua ? semua : semua.slice(mulai, mulai + PER_HAL_BKU);
  document.getElementById('isi-bku').innerHTML = tampil.length ? tampil.map((t, i) => `
    <tr${t.kat === KAT_SALDO_AWAL ? ' class="baris-saldo-awal"' : ''}><td class="c">${mulai + i + 1}</td><td>${tglIndo(t.tgl)}</td><td>${esc(t.ket)}</td><td>${esc(t.kat)}</td>
    <td class="angka">${t.masuk ? angka(t.masuk) : '-'}</td><td class="angka">${t.keluar ? angka(t.keluar) : '-'}</td>
    <td class="angka"><b>${angka(peta[t.id])}</b></td>
    <td class="c kol-aksi"><button type="button" class="btn-ikon ubah" data-aksi="ubah" data-id="${t.id}" aria-label="Ubah">${IK_SVG.pensil}</button>
    <button type="button" class="btn-ikon hapus" data-aksi="hapus" data-id="${t.id}" aria-label="Hapus">${IK_SVG.sampah}</button></td></tr>`).join('')
    : '<tr><td colspan="8" class="kosong">Belum ada transaksi pada periode ini.</td></tr>';
  document.getElementById('foot-bku').innerHTML =
    `<tr><td colspan="4">Total periode</td><td class="angka">${angka(masuk)}</td><td class="angka">${angka(keluar)}</td><td class="angka">${angka(saldo)}</td><td class="kol-aksi"></td></tr>`;
  const a = semua.length ? mulai + 1 : 0, b = bkuSemua ? semua.length : Math.min(mulai + PER_HAL_BKU, semua.length);
  document.getElementById('bku-info').textContent = `Menampilkan ${a} – ${b} dari ${semua.length} data` + (semua.some(t => t.kat === KAT_SALDO_AWAL) ? ' · Baris "Saldo Awal" ikut saldo, tidak dihitung sebagai pemasukan.' : '');
  // pager
  let hal = [];
  const dari = Math.max(1, Math.min(bkuHal - 2, total - 4)), sampai = Math.min(total, dari + 4);
  for (let p = dari; p <= sampai; p++) hal.push(p);
  document.getElementById('bku-pager').innerHTML =
    `<button type="button" data-hal="1" ${bkuHal === 1 ? 'disabled="disabled"' : ''}>«</button>` +
    `<button type="button" data-hal="${bkuHal - 1}" ${bkuHal === 1 ? 'disabled="disabled"' : ''}>‹</button>` +
    hal.map(p => `<button type="button" data-hal="${p}" class="${p === bkuHal ? 'aktif' : ''}">${p}</button>`).join('') +
    `<button type="button" data-hal="${bkuHal + 1}" ${bkuHal === total ? 'disabled="disabled"' : ''}>›</button>` +
    `<button type="button" data-hal="${total}" ${bkuHal === total ? 'disabled="disabled"' : ''}>»</button>`;
  // kop cetak
  const [yy, mm] = per.split('-');
  document.getElementById('bku-judul').textContent = `BUKU KAS UMUM - ${BULAN[Number(mm) - 1].toUpperCase()} ${yy}`;
  document.getElementById('bku-sub').textContent = `Total pemasukan ${rp(masuk)} | Total pengeluaran ${rp(keluar)} | Saldo akhir ${rp(saldo)}`;
  isiTglCetak();
}
const IK_SVG = {
  pensil:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>',
  sampah:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7zM9 3h6l1 2h4v2H4V5h4z"/></svg>'
};
/* ---------- Pilihan keterangan: dropdown + saran saat mengetik, dipisah pemasukan / pengeluaran ---------- */
const jenisBKU = () => document.getElementById('bku-f-jenis').value;            // 'masuk' | 'keluar'
const daftarKet = j => (j === 'keluar' ? KET_PENGELUARAN : KET_PEMASUKAN);
function riwayatKet(j){                       // keterangan yang pernah dipakai (jenis sama), paling sering dulu
  const peta = {}, preset = daftarKet(j).map(p => p.ket.toLowerCase());
  BKU.forEach(t => {
    const nominal = j === 'keluar' ? t.keluar : t.masuk, k = String(t.ket || '').trim();
    if (!(nominal > 0) || !k || t.kat === KAT_SALDO_AWAL || preset.indexOf(k.toLowerCase()) >= 0) return;
    const o = peta[k.toLowerCase()] || (peta[k.toLowerCase()] = { ket:k, kat:t.kat, n:0 });
    o.n++; o.kat = t.kat;
  });
  return Object.keys(peta).map(k => peta[k]).sort((a, b) => b.n - a.n || a.ket.localeCompare(b.ket)).slice(0, 15);
}
function isiSaranKet(){
  const j = jenisBKU(), preset = daftarKet(j), riwayat = riwayatKet(j);
  document.getElementById('bku-f-pilih').innerHTML = '<option value="">— Pilih dari daftar —</option>'
    + preset.map((p, i) => `<option value="p${i}">${esc(p.ket)}</option>`).join('')
    + (riwayat.length ? '<optgroup label="Pernah dipakai">' + riwayat.map((r, i) => `<option value="r${i}">${esc(r.ket)}</option>`).join('') + '</optgroup>' : '');
  document.getElementById('bku-ket-saran').innerHTML = preset.concat(riwayat).map(x => `<option value="${esc(x.ket)}"></option>`).join('');
}
function cocokKet(teks, j){
  const t = String(teks || '').trim().toLowerCase();
  return t ? daftarKet(j).concat(riwayatKet(j)).find(x => x.ket.toLowerCase() === t) || null : null;
}
document.getElementById('bku-f-pilih').addEventListener('change', e => {
  const v = e.target.value, j = jenisBKU();
  if (!v) return;
  const x = v.charAt(0) === 'p' ? daftarKet(j)[Number(v.slice(1))] : riwayatKet(j)[Number(v.slice(1))];
  if (x){ document.getElementById('bku-f-ket').value = x.ket; document.getElementById('bku-f-kat').value = x.kat; }
  e.target.value = '';                                  // kembali ke judul agar bisa memilih lagi
});
document.getElementById('bku-f-ket').addEventListener('input', e => {    // ketik/pilih saran yang cocok -> kategori ikut terisi
  const x = cocokKet(e.target.value, jenisBKU());
  if (x) document.getElementById('bku-f-kat').value = x.kat;
});
document.getElementById('bku-f-jenis').addEventListener('change', () => {
  const inp = document.getElementById('bku-f-ket'), lama = jenisBKU() === 'masuk' ? 'keluar' : 'masuk';
  if (cocokKet(inp.value, lama)) inp.value = '';        // isian dari daftar jenis sebelumnya dikosongkan
  isiSaranKet();
});

function bukaFormBKU(id){
  bkuEditId = id || null;
  const t = id ? BKU.find(x => x.id === id) : null;
  document.getElementById('bku-judul-modal').textContent = t ? 'Ubah Transaksi' : 'Tambah Transaksi';
  const per = document.getElementById('bku-periode').value;
  document.getElementById('bku-f-tgl').value = t ? t.tgl : (per ? per + '-01' : '');
  document.getElementById('bku-f-jenis').value = t && t.keluar ? 'keluar' : 'masuk';
  isiSaranKet();
  document.getElementById('bku-f-kat').value = t ? t.kat : 'Air';
  document.getElementById('bku-f-ket').value = t ? t.ket : '';
  document.getElementById('bku-f-jml').value = t ? (t.masuk || t.keluar) : '';
  document.getElementById('bku-f-pesan').textContent = '';
  document.getElementById('modal-bku').classList.add('tampil');
}
const tutupFormBKU = () => document.getElementById('modal-bku').classList.remove('tampil');
document.getElementById('bku-tambah').addEventListener('click', () => bukaFormBKU(null));
document.getElementById('bku-f-batal').addEventListener('click', tutupFormBKU);
document.getElementById('modal-bku').addEventListener('click', e => { if (e.target.id === 'modal-bku') tutupFormBKU(); });
document.getElementById('form-bku').addEventListener('submit', async e => {
  e.preventDefault();
  const pesan = document.getElementById('bku-f-pesan');
  const tgl = document.getElementById('bku-f-tgl').value;
  const ket = document.getElementById('bku-f-ket').value.trim();
  const jml = Math.round(Number(document.getElementById('bku-f-jml').value));
  if (!tgl || !ket || !(jml > 0)){ pesan.textContent = 'Lengkapi tanggal, keterangan, dan jumlah (lebih dari 0).'; return; }
  const jenis = document.getElementById('bku-f-jenis').value;
  const item = { id: bkuEditId || (BKU.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1),
    tgl, ket, kat: document.getElementById('bku-f-kat').value, masuk: jenis === 'masuk' ? jml : 0, keluar: jenis === 'keluar' ? jml : 0 };
  if (!URL_ADMIN1){ pesan.textContent = 'URL_ADMIN1 belum diisi di template, data tidak bisa disimpan ke sheet.'; return; }
  const tombol = e.target.querySelector('[type=submit]');
  if (tombol) tombol.disabled = true;
  pesan.textContent = 'Menyimpan ke sheet...';
  try{
    const r = await panggilGAS(URL_ADMIN1, tambahKred({ action:'bku_simpan', data:JSON.stringify(item) }));
    if (!sukesGAS(r)){ pesan.textContent = (r && r.error) || 'Server menolak data. Belum tersimpan.'; return; }
  }catch(err){
    pesan.textContent = (err && err.message) || 'Server tidak terjangkau. Transaksi belum tersimpan.'; return;
  }finally{ if (tombol) tombol.disabled = false; }
  // server sudah menjawab sukses: baru perbarui tampilan
  if (bkuEditId) BKU = BKU.map(t => t.id === bkuEditId ? item : t); else BKU.push(item);
  pesan.textContent = '';
  isiPeriodeBKU();
  document.getElementById('bku-periode').value = tgl.slice(0, 7);
  tutupFormBKU(); renderBKU();
  tampilToast('Transaksi tersimpan di sheet.');
});
document.getElementById('isi-bku').addEventListener('click', async e => {
  const b = e.target.closest('button[data-aksi]');
  if (!b) return;
  const id = Number(b.dataset.id);
  if (b.dataset.aksi === 'ubah'){ bukaFormBKU(id); return; }
  if (!confirm('Hapus transaksi ini?')) return;
  if (!URL_ADMIN1){ tampilToast('URL_ADMIN1 belum diisi di template.'); return; }
  try{
    const r = await panggilGAS(URL_ADMIN1, tambahKred({ action:'bku_hapus', id:id }));
    if (!sukesGAS(r)){ tampilToast((r && r.error) || 'Server menolak penghapusan.'); return; }
  }catch(err){ tampilToast((err && err.message) || 'Server tidak terjangkau. Penghapusan belum tersimpan.'); return; }
  BKU = BKU.filter(t => t.id !== id);
  renderBKU();
  tampilToast('Transaksi dihapus dari sheet.');
});
document.getElementById('bku-pager').addEventListener('click', e => {
  const b = e.target.closest('button[data-hal]');
  if (!b || b.disabled) return;
  bkuHal = Number(b.dataset.hal); renderBKU();
});
['bku-periode', 'bku-kat'].forEach(id => document.getElementById(id).addEventListener('change', () => { bkuHal = 1; renderBKU(); }));
document.getElementById('bku-cari').addEventListener('input', () => { bkuHal = 1; renderBKU(); });
document.getElementById('bku-excel').addEventListener('click', () => {
  const per = document.getElementById('bku-periode').value;
  const { peta } = saldoKumulatif();
  const kepala = ['No', 'Tanggal', 'Keterangan', 'Kategori', 'Pemasukan', 'Pengeluaran', 'Saldo'];
  const isi = barisBKU().map((t, i) => [i + 1, tglIndo(t.tgl), t.ket, t.kat, t.masuk, t.keluar, peta[t.id]]);
  unduhCSV('bku-' + per + '.csv', [kepala].concat(isi));
});
function unduhCSV(nama, baris){
  const csv = baris.map(b => b.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Rekap Pemakaian Air ---------- */
let rekapSemua = false;
let rekapLihatSemua = false;
function renderRekapAir(){
  isiPilihTahun('rekap-tahun');
  const tahun = Number(document.getElementById('rekap-tahun').value);
  if (tahun !== new Date().getFullYear() && !tahunDimuat[tahun]) muatTahunLain(tahun, renderRekapAir);
  const d = dataAir(tahun);
  const totPakai = d.reduce((s, x) => s + x.vol, 0);
  const totTagihan = d.reduce((s, x) => s + x.tagihan, 0);
  const totBayar = d.reduce((s, x) => s + x.bayar, 0);
  const saldo = BKU.filter(t => Number(t.tgl.slice(0, 4)) <= tahun).reduce((s, t) => s + t.masuk - t.keluar, 0);
  document.getElementById('rkb-pakai').textContent = angka(totPakai) + ' m³';
  document.getElementById('rkb-tagihan').textContent = rp(totTagihan);
  document.getElementById('rkb-terima').textContent = rp(totBayar);
  document.getElementById('rkb-saldo').textContent = rp(saldo);
  document.getElementById('rekap-grafik').innerHTML = grafikBatang({
    label:'Grafik pemakaian dan tagihan air', kategori:BLN3, fmtKiri:v => angka(v), fmtKanan:juta,
    seri:[{ nama:'Pemakaian (m³)', warna:'#1B80E8', nilai:d.map(x => x.vol) },
          { nama:'Tagihan', warna:'#FF9A3D', nilai:d.map(x => x.tagihan), kanan:true }] });
  const tampil = rekapSemua || rekapLihatSemua ? d : d.slice(0, 3);
  document.getElementById('isi-rekap-air').innerHTML = tampil.map((x, i) => `
    <tr><td class="c">${i + 1}</td><td class="c">${x.nama}</td><td class="c">${x.dicatat ? angka(x.vol) : '-'}</td>
    <td class="c">${x.dicatat ? rp(x.tagihan) : '-'}</td><td class="c">${x.dicatat ? rp(x.bayar) : '-'}</td>
    <td class="c">${badgeLaporan(x.status)}</td></tr>`).join('');
  document.getElementById('foot-rekap-air').innerHTML =
    `<tr><td colspan="2">Total ${tahun}</td><td class="c">${angka(totPakai)}</td><td class="c">${rp(totTagihan)}</td><td class="c">${rp(totBayar)}</td><td></td></tr>`;
  document.getElementById('rekap-semua').textContent = rekapLihatSemua ? 'Ringkas ‹' : 'Lihat Semua ›';
  document.getElementById('rekap-judul').textContent = `REKAP PEMAKAIAN AIR - TAHUN ${tahun}`;
  document.getElementById('rekap-sub').textContent = `Total pemakaian ${angka(totPakai)} m³ | Total tagihan ${rp(totTagihan)} | Total penerimaan ${rp(totBayar)}`;
  isiTglCetak();
}
document.getElementById('rekap-tahun').addEventListener('change', renderRekapAir);
document.getElementById('rekap-semua').addEventListener('click', () => { rekapLihatSemua = !rekapLihatSemua; renderRekapAir(); });

/* ---------- Laporan 1 Tahunan ---------- */
function renderLaporan(){
  isiPilihTahun('lap-tahun');
  const tahun = Number(document.getElementById('lap-tahun').value);
  if (tahun !== new Date().getFullYear() && !tahunDimuat[tahun]) muatTahunLain(tahun, renderLaporan);
  const masukBln = Array(12).fill(0), keluarBln = Array(12).fill(0);
  BKU.filter(t => Number(t.tgl.slice(0, 4)) === tahun).forEach(t => {
    const m = Number(t.tgl.slice(5, 7)) - 1;
    if (t.kat === KAT_SALDO_AWAL) return;          // saldo awal bukan pemasukan/pengeluaran bulan itu
    masukBln[m] += t.masuk; keluarBln[m] += t.keluar;
  });
  const masuk = masukBln.reduce((s, v) => s + v, 0), keluar = keluarBln.reduce((s, v) => s + v, 0);
  const saldo = BKU.filter(t => Number(t.tgl.slice(0, 4)) <= tahun).reduce((s, t) => s + t.masuk - t.keluar, 0);
  const d = dataAir(tahun);
  const totPakai = d.reduce((s, x) => s + x.vol, 0), totTagihan = d.reduce((s, x) => s + x.tagihan, 0), totBayar = d.reduce((s, x) => s + x.bayar, 0);
  document.getElementById('lp-masuk').textContent = rp(masuk);
  document.getElementById('lp-keluar').textContent = rp(keluar);
  document.getElementById('lp-saldo').textContent = rp(saldo);
  document.getElementById('lap-grafik').innerHTML = grafikBatang({
    label:'Grafik keuangan tahunan', kategori:BLN3, fmtKiri:juta,
    seri:[{ nama:'Pemasukan', warna:'#1B80E8', nilai:masukBln }, { nama:'Pengeluaran', warna:'#FF9A3D', nilai:keluarBln }] });
  const baris = [['Total Pemakaian Air', angka(totPakai) + ' m³'], ['Total Tagihan Pelanggan', rp(totTagihan)],
    ['Total Penerimaan', rp(totBayar)], ['Total Pengeluaran', rp(keluar)], ['Saldo Awal Tahun', rp(saldo - masuk + keluar)]];
  document.getElementById('isi-lap').innerHTML = baris.map((b, i) =>
      `<tr><td class="no-c">${i + 1}</td><td>${b[0]}</td><td class="angka">${b[1]}</td></tr>`).join('') +
    `<tr class="total"><td class="no-c">6</td><td>Saldo Akhir Tahun</td><td class="angka">${rp(saldo)}</td></tr>`;
  const tahunKini = new Date().getFullYear(), mKini = new Date().getMonth();
  const sampai = tahun === tahunKini ? mKini : (tahun < tahunKini ? 11 : -1);
  const awalTahun = saldo - masuk + keluar;
  const rpS = v => (v < 0 ? '-' : '') + rp(Math.abs(v));
  let kum = awalTahun; const saldoBln = [];
  document.getElementById('isi-arus').innerHTML = BULAN.map((n, m) => {
    if (m > sampai){ saldoBln.push(null); return `<tr><td>${n}</td><td class="angka">-</td><td class="angka">-</td><td class="angka">-</td><td class="angka">-</td></tr>`; }
    const sel = masukBln[m] - keluarBln[m];
    kum += sel; saldoBln.push(kum);
    return `<tr><td>${n}</td><td class="angka">${rp(masukBln[m])}</td><td class="angka">${rp(keluarBln[m])}</td><td class="angka ${sel < 0 ? 'neg' : ''}">${rpS(sel)}</td><td class="angka">${rpS(kum)}</td></tr>`;
  }).join('');
  document.getElementById('foot-arus').innerHTML =
    `<tr><td>Total ${tahun}</td><td class="angka">${rp(masuk)}</td><td class="angka">${rp(keluar)}</td><td class="angka">${rpS(masuk - keluar)}</td><td class="angka">${rpS(saldo)}</td></tr>`;
  document.getElementById('lap-saldo-grafik').innerHTML = grafikGaris({ label:'Tren saldo kas ' + tahun, kategori:BLN3, nilai:saldoBln, fmt:juta });
  const kat = {};
  BKU.filter(t => Number(t.tgl.slice(0, 4)) === tahun && t.kat !== KAT_SALDO_AWAL && t.keluar > 0).forEach(t => { kat[t.kat] = (kat[t.kat] || 0) + t.keluar; });
  const daftarKat = Object.entries(kat).sort((a, b) => b[1] - a[1]);
  document.getElementById('lap-komposisi').innerHTML = daftarKat.length ? daftarKat.map(([k, v]) => {
    const pk = keluar ? Math.round(v / keluar * 100) : 0;
    return `<div class="komp"><span>${esc(k)}</span><div class="bar"><i style="width:${pk}%"></i></div><b>${rp(v)} <em>${pk}%</em></b></div>`;
  }).join('') : '<p class="dash-kosong">Belum ada pengeluaran pada tahun ini.</p>';
  const surplus = masuk - keluar;
  const rasio = masuk ? Math.round(keluar / masuk * 100) : null;
  const penagihan = totTagihan ? Math.round(totBayar / totTagihan * 100) : null;
  const puncak = d.reduce((b, x) => x.vol > (b ? b.vol : 0) ? { nama:x.nama, vol:x.vol } : b, null);
  const kartuS = (kls, judul, nilai, sub) => `<div class="sorot ${kls}"><small>${judul}</small><b>${nilai}</b><em>${sub}</em></div>`;
  document.getElementById('lap-sorot').innerHTML =
    kartuS(surplus >= 0 ? 'plus' : 'minus', 'Surplus / Defisit', rpS(surplus), surplus >= 0 ? 'Pemasukan lebih besar dari pengeluaran' : 'Pengeluaran melebihi pemasukan') +
    kartuS('', 'Rasio Pengeluaran', rasio === null ? '-' : rasio + '%', 'Pengeluaran dibanding pemasukan') +
    kartuS('', 'Tingkat Penagihan', penagihan === null ? '-' : penagihan + '%', penagihan === null ? 'Belum ada data tagihan' : `${rp(totBayar)} dari ${rp(totTagihan)}`) +
    kartuS('', 'Puncak Pemakaian', puncak ? puncak.nama : '-', puncak ? angka(puncak.vol) + ' m³' : 'Belum ada data');
  let lunas = 0, belum = 0;
  {
    for (let m = 0; m < 12; m++) (anggotaUntuk(tahun) || []).forEach(a => { const s = recBend(a, m).status; if (s === 'lunas') lunas++; else if (s === 'belum' || s === 'kurang') belum++; });
  }
  const pct = lunas + belum ? Math.round(lunas / (lunas + belum) * 100) : 0;
  document.getElementById('lap-donat').innerHTML = donatDua(pct, 'Status pembayaran');
  document.getElementById('lap-judul').textContent = `LAPORAN 1 TAHUNAN - ${tahun}`;
  document.getElementById('lap-sub').textContent = 'Rekapitulasi keuangan, pemakaian dan pembayaran dalam 1 tahun';
  isiTglCetak();
}
document.getElementById('lap-tahun').addEventListener('change', renderLaporan);

/* ---------- Cetak per halaman bendahara ---------- */
function cetakBendahara(zona, pdf){
  const thn = new Date().getFullYear();
  let nama = '';
  if (zona === 'bku'){ bkuSemua = true; renderBKU(); nama = 'BKU_' + document.getElementById('bku-periode').value; }
  else if (zona === 'rekap-air'){ rekapSemua = true; renderRekapAir(); nama = 'Rekap_Pemakaian_Air_' + document.getElementById('rekap-tahun').value; }
  else if (zona === 'laporan'){ renderLaporan(); nama = 'Laporan_1_Tahunan_' + document.getElementById('lap-tahun').value; }
  if (pdf) tampilToast('Pada jendela cetak, pilih tujuan "Simpan sebagai PDF".');
  const pulih = () => {
    window.removeEventListener('afterprint', pulih);
    if (bkuSemua || rekapSemua){ bkuSemua = false; rekapSemua = false; renderBKU(); renderRekapAir(); }
  };
  window.addEventListener('afterprint', pulih);
  cetak(zona, (nama || 'Laporan_' + thn).replace(/[^\w\-]+/g, '_'));
}
document.getElementById('bku-cetak').addEventListener('click', () => cetakBendahara('bku'));
document.getElementById('rekap-cetak').addEventListener('click', () => cetakBendahara('rekap-air'));
document.getElementById('lap-cetak').addEventListener('click', () => cetakBendahara('laporan'));

/* Grafik garis sederhana (tren saldo kas). o: { kategori:[], nilai:[angka|null], fmt, label } */
function grafikGaris(o){
  const W = 640, H = 230, L = 60, R = 16, T = 18, B = 32, N = 4;
  const ada = o.nilai.filter(v => v !== null);
  if (!ada.length) return '<p class="dash-kosong">Belum ada data.</p>';
  const mn = Math.min(0, ...ada), mx = Math.max(1, ...ada);
  const sk = skalaTick(mx - mn, N), langkah = sk.langkah;
  const yMin = mn < 0 ? Math.floor(mn / langkah) * langkah : 0;
  const n = Math.max(N, Math.ceil((mx - yMin) / langkah)), yMax = yMin + langkah * n;
  const lb = (W - L - R) / o.kategori.length;
  const x = i => L + (i + 0.5) * lb;
  const y = v => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  let svg = '<svg class="grafik-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Grafik') + '">';
  for (let k = 0; k <= n; k++){
    const yy = y(yMin + langkah * k);
    svg += '<line x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy + '" stroke="#DCE9F7"/>' +
      '<text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#4D6586">' + o.fmt(yMin + langkah * k) + '</text>';
  }
  const pts = [];
  o.nilai.forEach((v, i) => { if (v !== null) pts.push([x(i), y(v), v, i]); });
  svg += '<path d="' + pts.map((t, i) => (i ? 'L' : 'M') + t[0] + ' ' + t[1]).join(' ') + '" fill="none" stroke="#1B80E8" stroke-width="2.5"/>';
  pts.forEach(t => { svg += '<circle cx="' + t[0] + '" cy="' + t[1] + '" r="4" fill="#1B80E8" stroke="#fff" stroke-width="2"><title>' + o.kategori[t[3]] + ': ' + rp(t[2]) + '</title></circle>'; });
  o.kategori.forEach((nm, i) => { svg += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#12294A">' + nm + '</text>'; });
  return svg + '</svg>';
}

/* Menu geser (burger) untuk layar sempit */
const elBend = document.getElementById('v-bend');
function setDrawer(buka){
  elBend.classList.toggle('drawer-buka', buka);
  const b = document.getElementById('btn-burger');
  b.setAttribute('aria-expanded', buka ? 'true' : 'false');
  b.setAttribute('aria-label', buka ? 'Tutup menu' : 'Buka menu');
}
function tutupDrawer(){ setDrawer(false); }
document.getElementById('btn-burger').addEventListener('click', () => setDrawer(!elBend.classList.contains('drawer-buka')));
document.getElementById('drawer-lapis').addEventListener('click', tutupDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupDrawer(); });
elBend.addEventListener('click', e => { const b = e.target.closest('[data-ke]'); if (b) tampilView(b.dataset.ke); });
let swX = 0, swY = 0;
document.addEventListener('touchstart', e => { const t = e.touches[0]; swX = t.clientX; swY = t.clientY; }, { passive:true });
document.addEventListener('touchend', e => {
  if (!elBend.classList.contains('aktif') || window.innerWidth > 1100) return;
  const t = e.changedTouches[0], dx = t.clientX - swX, dy = t.clientY - swY;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const buka = elBend.classList.contains('drawer-buka');
  if (!buka && dx < 0 && swX > window.innerWidth - 40) setDrawer(true);   // geser dari tepi kanan = buka
  else if (buka && dx > 0) setDrawer(false);                              // geser ke kanan = tutup
}, { passive:true });

/* Riak air saat pintu disentuh */
document.querySelectorAll('.pintu').forEach(function (p){
  p.addEventListener('pointerdown', function (e){
    var r = p.getBoundingClientRect(), sp = document.createElement('span'), d = Math.max(r.width, r.height) * 1.6;
    sp.className = 'riak'; sp.style.width = sp.style.height = d + 'px';
    sp.style.left = (e.clientX - r.left) + 'px'; sp.style.top = (e.clientY - r.top) + 'px';
    p.appendChild(sp); setTimeout(function (){ sp.remove(); }, 850);
  });
});
