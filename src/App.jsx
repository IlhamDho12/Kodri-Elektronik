import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  FileText, 
  Search, 
  Trash2, 
  PlusCircle, 
  MinusCircle, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Send, 
  CheckCircle, 
  Moon, 
  Sun, 
  AlertTriangle, 
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
  Printer,
  Camera,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import { dbService, isMock } from './services/db';
import { downloadExcelBackup, parseExcelBackup } from './services/excelBackup';
import { runDailyDemoAutomation } from './services/demoAutomation';
import { hasWriteAccess, saveWriteAccess, unlockWriteAccess } from './services/writeAccess';
import logoImg from './assets/logo.png';

const getNominalDigits = (value) => String(value ?? '').replace(/\D/g, '');
const formatNominal = (value) => getNominalDigits(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const parseNominal = (value) => Number(getNominalDigits(value)) || 0;

function NominalInput({ value, onValueChange, ...props }) {
  const inputRef = useRef(null);
  const caretDigitCount = useRef(null);

  useLayoutEffect(() => {
    if (caretDigitCount.current === null || document.activeElement !== inputRef.current) return;
    const digitCount = caretDigitCount.current;
    const formattedValue = formatNominal(value);
    let position = 0;
    let digitsFound = 0;
    while (position < formattedValue.length && digitsFound < digitCount) {
      if (/\d/.test(formattedValue[position])) digitsFound += 1;
      position += 1;
    }
    inputRef.current.setSelectionRange(position, position);
    caretDigitCount.current = null;
  }, [value]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={formatNominal(value)}
      onChange={(event) => {
        const input = event.currentTarget;
        const cursor = input.selectionStart ?? input.value.length;
        caretDigitCount.current = getNominalDigits(input.value.slice(0, cursor)).length;
        onValueChange(getNominalDigits(input.value));
      }}
    />
  );
}

// Helper to compress image client-side to maximum 800px width/height and 60% quality
const compressImage = (file, callback) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG with 0.6 quality (60%)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
      callback(compressedDataUrl);
    };
  };
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  // Fix #12: Baca tema dari localStorage agar persisten setelah refresh
  const [theme, setTheme] = useState(() => localStorage.getItem('kod_theme') || 'light');
  
  // Data States
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI states
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [printType, setPrintType] = useState('receipt'); // receipt atau report
  const [lastTxData, setLastTxData] = useState(null);
  const [printProducts, setPrintProducts] = useState([]);
  const [writeUnlocked, setWriteUnlocked] = useState(() => hasWriteAccess());
  const [writeAccessModal, setWriteAccessModal] = useState(false);
  const [writeAccessCode, setWriteAccessCode] = useState('');
  const [writeAccessError, setWriteAccessError] = useState('');
  const [pendingWrite, setPendingWrite] = useState(null);
  
  // Custom Confirmation Dialog state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    message: '',
    onConfirm: null,
    onCancel: null
  });

  const showConfirm = (message, onConfirm, onCancel = null) => {
    setConfirmModal({
      show: true,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, show: false }));
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const requestWriteAccess = (action) => {
    if (writeUnlocked) {
      action();
      return;
    }
    setPendingWrite(() => action);
    setWriteAccessCode('');
    setWriteAccessError('');
    setWriteAccessModal(true);
  };

  useEffect(() => {
    const handleExpiredAccess = () => setWriteUnlocked(false);
    window.addEventListener('kodri:write-access-expired', handleExpiredAccess);
    return () => window.removeEventListener('kodri:write-access-expired', handleExpiredAccess);
  }, []);

  const handleWriteAccessSubmit = async (event) => {
    event.preventDefault();
    setWriteAccessError('');
    try {
      if (isMock && import.meta.env.DEV) {
        if (writeAccessCode !== '7768') throw new Error('Kode akses salah. Silakan coba lagi.');
        saveWriteAccess({ token: 'local-development-only', expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      } else {
        await unlockWriteAccess(writeAccessCode);
      }
      setWriteUnlocked(true);
      setWriteAccessModal(false);
      const action = pendingWrite;
      setPendingWrite(null);
      if (action) action();
    } catch (error) {
      setWriteAccessError(error instanceof Error ? error.message : 'Kode akses tidak dapat diverifikasi.');
    }
  };
  
  // Filter state untuk print laporan
  const [filterRange, setFilterRange] = useState('semua');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Helper Toast Animasi (Pengganti alert bawaan browser)
  const showToast = (message, type = 'success') => {
    // Paksa hilangkan dulu jika ada toast aktif agar animasi bisa terpicu ulang
    setToast({ show: false, type, message: '' });
    setTimeout(() => {
      setToast({ show: true, type, message });
    }, 50);
  };

  // Otomatis hilangkan toast setelah 3 detik
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  // Otomatis bersihkan dummy data lama dari LocalStorage (jika terdeteksi p1)
  useEffect(() => {
    const prods = localStorage.getItem('toko_produk');
    if (prods && prods.includes('"id":"p1"')) {
      localStorage.removeItem('toko_produk');
      localStorage.removeItem('toko_pembelian');
      localStorage.removeItem('toko_transaksi');
      localStorage.removeItem('toko_pengeluaran');
      window.location.reload();
    }
  }, []);

  // Fetch Data Toko
  const fetchData = async ({ showLoading = true, throwOnError = false } = {}) => {
    try {
      if (showLoading) setLoading(true);
      if (isMock) {
        const automationResult = runDailyDemoAutomation();
        const generatedParts = [
          automationResult.createdCount > 0 ? `${automationResult.createdCount} penjualan` : null,
          automationResult.purchaseCreated ? '1 pembelian stok' : null,
          automationResult.expenseCreated ? '1 pengeluaran' : null
        ].filter(Boolean);
        if (generatedParts.length > 0) {
          showToast(`Simulasi DEMO ${automationResult.dateKey}: ${generatedParts.join(', ')}.`, 'success');
        } else if (automationResult.skippedLocations?.length > 0 || automationResult.skippedPurchase || automationResult.skippedExpense) {
          showToast('Sebagian data simulasi DEMO tidak dibuat karena stok atau riwayat yang cocok tidak tersedia.', 'error');
        }
      }
      const prods = await dbService.getProducts();
      const txs = await dbService.getTransactions();
      const pur = await dbService.getPurchases();
      const exp = await dbService.getExpenses();
      
      setProducts(prods);
      setTransactions(txs);
      setPurchases(pur);
      setExpenses(exp);
    } catch (err) {
      console.error(err);
      showToast('Gagal mengambil data dari database.', 'error');
      if (throwOnError) throw err;
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Ambil data saat aplikasi dibuka.
  useEffect(() => {
    fetchData();
  }, []);

  // Theme Toggle - simpan ke localStorage agar persisten
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('kod_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Terapkan tema dari localStorage saat aplikasi pertama dibuka
  useEffect(() => {
    const savedTheme = localStorage.getItem('kod_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Helper Format Rupiah
  const formatRupiah = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val);
  };

  // Cetak struk thermal atau laporan A4 melalui dialog print browser.
  const handleTriggerPrint = (type) => {
    document.body.dataset.printType = type;
    window.addEventListener('afterprint', () => {
      delete document.body.dataset.printType;
    }, { once: true });
    setPrintType(type);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Logika Filter Laporan untuk cetak Z-Report
  const getFilteredReportData = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const fTx = transactions.filter(t => {
      const tDate = new Date(t.tanggal);
      if (filterRange === 'hari_ini') return tDate >= today;
      if (filterRange === '7_hari') return tDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (filterRange === 'bulan_ini') return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
      if (filterRange === 'custom') {
        if (!startDate || !endDate) return true;
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        return tDate >= s && tDate <= e;
      }
      return true;
    });

    const fExp = expenses.filter(e => {
      const eDate = new Date(e.tanggal);
      if (filterRange === 'hari_ini') return eDate >= today;
      if (filterRange === '7_hari') return eDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (filterRange === 'bulan_ini') return eDate.getMonth() === now.getMonth() && eDate.getFullYear() === now.getFullYear();
      if (filterRange === 'custom') {
        if (!startDate || !endDate) return true;
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        return eDate >= s && eDate <= e;
      }
      return true;
    });

    const fPur = purchases.filter(p => {
      const pDate = new Date(p.status === 'Lunas' ? p.tanggal_pelunasan || p.tanggal : p.tanggal);
      if (filterRange === 'hari_ini') return pDate >= today;
      if (filterRange === '7_hari') return pDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (filterRange === 'bulan_ini') return pDate.getMonth() === now.getMonth() && pDate.getFullYear() === now.getFullYear();
      if (filterRange === 'custom') {
        if (!startDate || !endDate) return true;
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        return pDate >= s && pDate <= e;
      }
      return true;
    });

    const omset = fTx.reduce((sum, t) => sum + Number(t.total_harga), 0);
    
    // Pengeluaran riil = pembelian berstatus lunas + biaya operasional harian.
    const beliBarang = fPur.filter(p => p.status === 'Lunas').reduce((sum, p) => sum + Number(p.total_nota), 0);
    const biayaOperasional = fExp.reduce((sum, e) => sum + Number(e.jumlah), 0);
    const totalPengeluaran = beliBarang + biayaOperasional;
    
    // Keuntungan Riil = Pemasukan - Pengeluaran
    const labaBersih = omset - totalPengeluaran;

    const piutang = transactions.filter(t => t.metode_pembayaran === 'Tempo' && t.status_pembayaran === 'Belum Lunas').reduce((sum, t) => sum + Number(t.total_harga), 0);
    const hutang = purchases.filter(p => p.status === 'Tempo').reduce((sum, p) => sum + Number(p.total_nota), 0);

    return {
      transactions: fTx,
      purchases: fPur,
      expenses: fExp,
      omset,
      beliBarang,
      biayaOperasional,
      totalPengeluaran,
      labaBersih,
      piutang,
      hutang,
      rangeText: filterRange === 'hari_ini' ? 'HARI INI' : filterRange === '7_hari' ? '7 HARI TERAKHIR' : filterRange === 'bulan_ini' ? 'BULAN INI' : filterRange === 'custom' ? `PERIODE ${startDate ? new Date(`${startDate}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '...'} s/d ${endDate ? new Date(`${endDate}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '...'}` : 'SEMUA PERIODE'
    };
  };

  const reportData = getFilteredReportData();

  return (
    <div className="app-container">
      {/* Toast Notification Animasi */}
      {toast.show && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Mobile Top Bar */}
      <div className="mobile-top-bar no-print" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoImg} alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '6px', marginRight: '8px' }} />
          <span className="mobile-title">Kodri Elektronik</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn-icon-only" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>

      {/* Sidebar Desktop */}
      <aside className="sidebar no-print">
        <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logoImg} alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
          <div className="brand-name">Kodri Elektronik</div>
        </div>
        <nav className="sidebar-menu">
          <button 
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            Dashboard Keuangan
          </button>
          <button 
            className={`menu-item ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <ShoppingCart size={20} />
            Kasir (Mulai Jual)
          </button>
          <button 
            className={`menu-item ${activeTab === 'produk' ? 'active' : ''}`}
            onClick={() => setActiveTab('produk')}
          >
            <Package size={20} />
            Stok & Pembelian
          </button>
          <button 
            className={`menu-item ${activeTab === 'pengeluaran' ? 'active' : ''}`}
            onClick={() => setActiveTab('pengeluaran')}
          >
            <TrendingDown size={20} />
            Catat Pengeluaran
          </button>
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
              {isMock ? '🔴 Demo (Lokal HP/PC)' : '🟢 Cloud Supabase Aktif'}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn-icon-only" onClick={toggleTheme} aria-label="Toggle Theme">
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Desktop Top Header */}
        <header className="top-header no-print">
          <div className="header-title">
            <h1>
              {activeTab === 'dashboard' && 'Dashboard Keuangan'}
              {activeTab === 'pos' && 'Menu Kasir (Penjualan)'}
              {activeTab === 'produk' && 'Stok & Pembelian Barang'}
              {activeTab === 'pengeluaran' && 'Biaya Operasional Toko'}
            </h1>
            <p>
              {activeTab === 'dashboard' && 'Pantau keuntungan, pengeluaran, hutang supplier, tempo pelanggan, dan grafik penjualan'}
              {activeTab === 'pos' && 'Pencatatan penjualan cepat berdasarkan lokasi toko'}
              {activeTab === 'produk' && 'Catat transaksi pembelian, lalu distribusikan stok yang diterima ke Rumah dan Pasar'}
              {activeTab === 'pengeluaran' && 'Catat pengeluaran harian seperti bensin, makan, iuran, dll.'}
            </p>
          </div>
          <div className="header-actions">
            {isMock && (
              <span className="badge badge-warning" style={{ gap: '6px', padding: '8px 12px' }}>
                <Database size={14} /> Mode Demo Offline
              </span>
            )}
          </div>
        </header>

        {isMock && activeTab === 'dashboard' && (
          <div className="alert-banner alert-info-banner no-print">
            <Database size={18} />
            <div>
              <strong>Mode demo:</strong> Data hanya tersimpan di browser ini. Hubungkan Supabase melalui file <code>.env</code> untuk sinkronisasi antar perangkat.
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--text-muted)', gap: '16px' }}>
            <div className="loading-spinner"></div>
            <span style={{ fontSize: '0.9rem' }}>Memuat data toko...</span>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView 
                products={products} 
                transactions={transactions} 
                purchases={purchases}
                expenses={expenses} 
                fetchData={fetchData}
                showToast={showToast}
                showConfirm={showConfirm}
                formatRupiah={formatRupiah}
                filterRange={filterRange}
                setFilterRange={setFilterRange}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                handleTriggerPrint={handleTriggerPrint}
                requestWriteAccess={requestWriteAccess}
              />
            )}
            {activeTab === 'pos' && (
              <PosView 
                products={products} 
                transactions={transactions}
                formatRupiah={formatRupiah} 
                fetchData={fetchData}
                setLastTxData={setLastTxData}
                handleTriggerPrint={handleTriggerPrint}
                showToast={showToast}
                requestWriteAccess={requestWriteAccess}
              />
            )}
            {activeTab === 'produk' && (
              <InventoryView
                products={products} 
                purchases={purchases}
                formatRupiah={formatRupiah} 
                fetchData={fetchData}
                showToast={showToast}
                showConfirm={showConfirm}
                handleTriggerPrint={handleTriggerPrint}
                setPrintProducts={setPrintProducts}
                requestWriteAccess={requestWriteAccess}
              />
            )}
            {activeTab === 'pengeluaran' && (
              <ExpensesView 
                expenses={expenses} 
                formatRupiah={formatRupiah} 
                fetchData={fetchData}
                showToast={showToast}
                showConfirm={showConfirm}
                requestWriteAccess={requestWriteAccess}
              />
            )}
          </>
        )}
      </main>

      {/* Struk thermal untuk transaksi kasir */}
      {printType === 'receipt' && <div className="print-only receipt-container">
        <div className="receipt-header">
          <div className="receipt-title">KODRI ELEKTRONIK</div>
          <div style={{ fontSize: '7pt' }}>Pasar & Rumah Sedia Alat Listrik</div>
          <div style={{ fontSize: '7pt' }}>Tanggal: {new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</div>
          {/* Fix #10: Nomor struk unik */}
          {printType === 'receipt' && lastTxData && (
            <div style={{ fontSize: '6.5pt', color: '#888', marginTop: '2px' }}>No. {lastTxData.id ? lastTxData.id.toString().slice(-6).toUpperCase() : new Date().getTime().toString().slice(-6)}</div>
          )}
        </div>
        
        <div className="receipt-divider"></div>

        {lastTxData && (
          <>
            <div style={{ fontSize: '7.5pt', marginBottom: '4px' }}>
              <div className="receipt-row"><span>Lokasi:</span><span>{lastTxData.lokasi_penjualan}</span></div>
              <div className="receipt-row"><span>Nama:</span><span>{lastTxData.nama_pelanggan || '-'}</span></div>
              <div className="receipt-row"><span>Metode:</span><span>{lastTxData.metode_pembayaran}</span></div>
              <div className="receipt-row"><span>Status:</span><span>{lastTxData.status_pembayaran}</span></div>
            </div>
            
            <div className="receipt-divider"></div>
            
            <table className="receipt-table">
              <tbody>
                {lastTxData.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      {item.nama_produk}<br/>
                      {item.jumlah} x {formatRupiah(item.harga_jual_saat_ini)}
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'bottom' }}>
                      {formatRupiah(item.jumlah * item.harga_jual_saat_ini)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="receipt-divider"></div>
            
            <div className="receipt-row total">
              <span>TOTAL BELANJA:</span>
              <span>{formatRupiah(lastTxData.total_harga)}</span>
            </div>
            
            <div className="receipt-divider" style={{ marginTop: '12px' }}></div>
            <div style={{ textAlign: 'center', fontSize: '7pt', marginTop: '4px' }}>
              Terima Kasih Atas Kunjungan Anda!<br/>Barang yang sudah dibeli tidak dapat ditukar.
            </div>
          </>
        )}
      </div>}

      {printType === 'report' && (
        <section className="print-only financial-report-print">
          <header className="financial-report-header">
            <img src={logoImg} alt="Logo Kodri Elektronik" />
            <div>
              <h1>KODRI ELEKTRONIK</h1>
              <p>Pasar &amp; Rumah Sedia Alat Listrik</p>
              <p>LAPORAN KEUANGAN · {reportData.rangeText}</p>
            </div>
          </header>
          <div className="financial-report-meta">
            <span>Dicetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</span>
            <span>Periode laporan: {reportData.rangeText}</span>
          </div>

          <h2>Ringkasan Keuangan</h2>
          <table className="financial-report-table summary">
            <tbody>
              <tr><th>Penjualan / Omset</th><td>{formatRupiah(reportData.omset)}</td></tr>
              <tr><th>Pembelian barang yang dibayar</th><td>({formatRupiah(reportData.beliBarang)})</td></tr>
              <tr><th>Biaya operasional</th><td>({formatRupiah(reportData.biayaOperasional)})</td></tr>
              <tr className="financial-report-total"><th>Surplus / Defisit arus kas periode ini</th><td>{formatRupiah(reportData.labaBersih)}</td></tr>
            </tbody>
          </table>
          <p className="financial-report-note">Ringkasan ini menggunakan pencatatan arus kas sederhana: penjualan dikurangi pembelian yang sudah dibayar dan biaya operasional. Pembelian berstatus Tempo tercantum di tabel, tetapi belum dihitung sebagai arus kas keluar. Ini bukan laporan laba-rugi akuntansi berbasis HPP.</p>

          <h2>Penjualan</h2>
          <table className="financial-report-table">
            <thead><tr><th>#</th><th>Tanggal</th><th>Pelanggan</th><th>Lokasi</th><th>Pembayaran</th><th className="amount">Total</th></tr></thead>
            <tbody>
              {reportData.transactions.map((transaction, index) => (
                <tr key={transaction.id}>
                  <td>{index + 1}</td>
                  <td>{new Date(transaction.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>
                    {transaction.nama_pelanggan || 'Umum'}
                    {transaction.sumber_data === 'Simulasi otomatis (DEMO)' && <small>DEMO</small>}
                    {transaction.items?.length ? <small>{transaction.items.map((item) => `${item.nama_produk} (${item.jumlah})`).join(', ')}</small> : null}
                  </td>
                  <td>{transaction.lokasi_penjualan}</td>
                  <td>{transaction.metode_pembayaran} · {transaction.status_pembayaran}</td>
                  <td className="amount">{formatRupiah(transaction.total_harga)}</td>
                </tr>
              ))}
              {reportData.transactions.length === 0 && <tr><td colSpan="6" className="empty">Tidak ada transaksi penjualan pada periode ini.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan="5">Total penjualan</th><th className="amount">{formatRupiah(reportData.omset)}</th></tr></tfoot>
          </table>

          <h2>Pembelian Barang</h2>
          <table className="financial-report-table">
            <thead><tr><th>#</th><th>Tanggal transaksi / pelunasan</th><th>Supplier</th><th>Status</th><th>Barang</th><th className="amount">Nilai nota</th></tr></thead>
            <tbody>
              {reportData.purchases.map((purchase, index) => (
                <tr key={purchase.id}>
                  <td>{index + 1}</td>
                  <td>{new Date(purchase.status === 'Lunas' ? purchase.tanggal_pelunasan || purchase.tanggal : purchase.tanggal).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</td>
                  <td>{purchase.nama_supplier}{purchase.sumber_data === 'Simulasi otomatis (DEMO)' ? ' · DEMO' : ''}</td>
                  <td>{purchase.status === 'Lunas' ? `Lunas${purchase.tanggal_pelunasan ? ` · ${new Date(purchase.tanggal_pelunasan).toLocaleDateString('id-ID')}` : ''}` : 'Tempo / belum dibayar'}</td>
                  <td>{purchase.items?.map((item) => `${item.nama_produk} (${item.jumlah})`).join(', ') || '-'}</td>
                  <td className="amount">{formatRupiah(purchase.total_nota)}</td>
                </tr>
              ))}
              {reportData.purchases.length === 0 && <tr><td colSpan="6" className="empty">Tidak ada pembelian pada periode ini.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan="5">Pembelian dibayar pada periode ini</th><th className="amount">{formatRupiah(reportData.beliBarang)}</th></tr></tfoot>
          </table>

          <h2>Biaya Operasional</h2>
          <table className="financial-report-table">
            <thead><tr><th>#</th><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th className="amount">Jumlah</th></tr></thead>
            <tbody>
              {reportData.expenses.map((expense, index) => (
                <tr key={expense.id}>
                  <td>{index + 1}</td>
                  <td>{new Date(expense.tanggal).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</td>
                  <td>{expense.kategori}</td>
                  <td>{expense.keterangan || '-'}{expense.sumber_data === 'Simulasi otomatis (DEMO)' ? ' · DEMO' : ''}</td>
                  <td className="amount">{formatRupiah(expense.jumlah)}</td>
                </tr>
              ))}
              {reportData.expenses.length === 0 && <tr><td colSpan="5" className="empty">Tidak ada biaya operasional pada periode ini.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan="4">Total biaya operasional</th><th className="amount">{formatRupiah(reportData.biayaOperasional)}</th></tr></tfoot>
          </table>

          <div className="financial-report-balances">
            <strong>Posisi saat laporan dicetak:</strong>
            <span>Piutang pelanggan belum lunas: {formatRupiah(reportData.piutang)}</span>
            <span>Hutang supplier belum lunas: {formatRupiah(reportData.hutang)}</span>
          </div>

          <footer className="financial-report-signatures">
            <div><span>Disusun oleh,</span><strong>Admin / Kasir</strong><i></i><span>Nama &amp; tanda tangan</span></div>
            <div><span>Mengetahui,</span><strong>Pemilik Toko</strong><i></i><span>Nama &amp; tanda tangan</span></div>
          </footer>
          <div className="financial-report-footer">Laporan dicetak dari sistem Kodri Elektronik · {new Date().toLocaleDateString('id-ID')}</div>
        </section>
      )}

      {(printType === 'stock' || printType === 'stocktake') && (
        <section className="print-only inventory-report-print">
          <header className="financial-report-header">
            <img src={logoImg} alt="Logo Kodri Elektronik" />
            <div>
              <h1>KODRI ELEKTRONIK</h1>
              <p>Pasar &amp; Rumah Sedia Alat Listrik</p>
              <p>{printType === 'stock' ? 'LAPORAN POSISI STOK' : 'LEMBAR STOK OPNAME'}</p>
            </div>
          </header>
          <div className="financial-report-meta">
            <span>Dicetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</span>
            <span>Total jenis barang: {printProducts.length}</span>
          </div>
          <p className="inventory-report-instructions">
            {printType === 'stock'
              ? 'Ringkasan jumlah barang di seluruh lokasi berdasarkan catatan sistem saat laporan dicetak. Daftar mengikuti filter katalog yang sedang dipilih.'
              : 'Isi jumlah fisik yang dihitung di lapangan. Catat selisih dan keterangan untuk ditindaklanjuti.'}
          </p>
          <table className={`financial-report-table inventory-report-table ${printType === 'stocktake' ? 'stocktake' : ''}`}>
            <thead>
              <tr>
                <th>#</th>
                <th>Nama Barang</th>
                <th>Kategori</th>
                <th>Rumah</th>
                <th>Pasar</th>
                <th>Belum Dialokasikan</th>
                <th>Total Sistem</th>
                {printType === 'stocktake' && <><th>Hitung Fisik</th><th>Selisih</th><th>Catatan</th></>}
                {printType === 'stock' && <th>Status</th>}
              </tr>
            </thead>
            <tbody>
              {printProducts.map((product, index) => {
                const rumah = Number(product.stok_rumah) || 0;
                const pasar = Number(product.stok_pasar) || 0;
                const pending = Number(product.stok_belum_dialokasikan) || 0;
                const total = rumah + pasar + pending;
                const lowLocations = [
                  rumah < Number(product.stok_minimum) ? 'Rumah' : null,
                  pasar < Number(product.stok_minimum) ? 'Pasar' : null
                ].filter(Boolean);
                return (
                  <tr key={product.id}>
                    <td>{index + 1}</td>
                    <td>{product.nama}</td>
                    <td>{product.kategori}</td>
                    <td className="inventory-number">{rumah}</td>
                    <td className="inventory-number">{pasar}</td>
                    <td className="inventory-number">{pending}</td>
                    <td className="inventory-number"><strong>{total}</strong></td>
                    {printType === 'stocktake' ? (
                      <>
                        <td><span className="inventory-write-space"></span></td>
                        <td><span className="inventory-write-space"></span></td>
                        <td><span className="inventory-write-space"></span></td>
                      </>
                    ) : (
                      <td>{lowLocations.length ? `Stok rendah: ${lowLocations.join(', ')}` : pending ? 'Perlu dialokasikan' : 'Aman'}</td>
                    )}
                  </tr>
                );
              })}
              {printProducts.length === 0 && <tr><td colSpan={printType === 'stocktake' ? 10 : 8} className="empty">Tidak ada produk sesuai filter.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="3">Total unit</th>
                <th className="inventory-number">{printProducts.reduce((sum, product) => sum + (Number(product.stok_rumah) || 0), 0)}</th>
                <th className="inventory-number">{printProducts.reduce((sum, product) => sum + (Number(product.stok_pasar) || 0), 0)}</th>
                <th className="inventory-number">{printProducts.reduce((sum, product) => sum + (Number(product.stok_belum_dialokasikan) || 0), 0)}</th>
                <th className="inventory-number">{printProducts.reduce((sum, product) => sum + (Number(product.stok_rumah) || 0) + (Number(product.stok_pasar) || 0) + (Number(product.stok_belum_dialokasikan) || 0), 0)}</th>
                {printType === 'stocktake' && <th colSpan="3"></th>}
                {printType === 'stock' && <th></th>}
              </tr>
            </tfoot>
          </table>
          {printType === 'stocktake' && (
            <footer className="financial-report-signatures inventory-report-signatures">
              <div><span>Dihitung oleh,</span><strong>Admin</strong><i></i><span>Nama &amp; tanda tangan</span></div>
              <div><span>Disetujui oleh,</span><strong>Pemilik</strong><i></i><span>Nama &amp; tanda tangan</span></div>
            </footer>
          )}
          <div className="financial-report-footer">Laporan dicetak dari sistem Kodri Elektronik · {new Date().toLocaleDateString('id-ID')}</div>
        </section>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav no-print">
        <button 
          className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard />
          <span>Dashboard</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeTab === 'pos' ? 'active' : ''}`}
          aria-current={activeTab === 'pos' ? 'page' : undefined}
          onClick={() => setActiveTab('pos')}
        >
          <ShoppingCart />
          <span>Kasir</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeTab === 'produk' ? 'active' : ''}`}
          aria-current={activeTab === 'produk' ? 'page' : undefined}
          onClick={() => setActiveTab('produk')}
        >
          <Package />
          <span>Stok & Beli</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeTab === 'pengeluaran' ? 'active' : ''}`}
          aria-current={activeTab === 'pengeluaran' ? 'page' : undefined}
          onClick={() => setActiveTab('pengeluaran')}
        >
          <TrendingDown />
          <span>Biaya</span>
        </button>
      </nav>
      {/* MODAL KONFIRMASI CUSTOM TERANIMASI (YES/NO DIALOG) */}
      {writeAccessModal && (
        <div className="modal-overlay" onClick={() => { setWriteAccessModal(false); setPendingWrite(null); }}>
          <form className="modal-container" onSubmit={handleWriteAccessSubmit} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div className="modal-header">
              <span className="modal-title">Kode Akses untuk Mengubah Data</span>
              <button type="button" className="btn-icon-only btn-sm" aria-label="Tutup" onClick={() => { setWriteAccessModal(false); setPendingWrite(null); }}>X</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '14px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Isi kode akses untuk melanjutkan perubahan data. Akses edit aktif selama 8 jam atau sampai tab browser ditutup.
              </p>
              <label htmlFor="write-access-code">Kode akses</label>
              <input
                autoFocus
                id="write-access-code"
                type="password"
                autoComplete="current-password"
                className="form-control"
                value={writeAccessCode}
                onChange={(event) => setWriteAccessCode(event.target.value)}
                aria-describedby="write-access-error"
              />
              {writeAccessError && <p id="write-access-error" role="alert" style={{ marginTop: '10px', color: 'var(--color-danger)', fontSize: '0.85rem' }}>{writeAccessError}</p>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setWriteAccessModal(false); setPendingWrite(null); }}>Batal</button>
              <button type="submit" className="btn btn-primary">Lanjutkan</button>
            </div>
          </form>
        </div>
      )}

      {confirmModal.show && (
        <div className="modal-overlay confirm-overlay" onClick={confirmModal.onCancel}>
          <div className="modal-container confirm-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%', borderRadius: '12px' }}>
            <div className="modal-body" style={{ padding: '24px', textAlign: 'center' }}>
              <div className="confirm-icon-wrapper">
                <AlertTriangle size={48} />
              </div>
              <h3 style={{ marginTop: '16px', marginBottom: '12px', fontSize: '1.2rem', color: 'var(--text-main)' }}>Konfirmasi Tindakan</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                {confirmModal.message}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', gap: '12px', padding: '16px 24px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={confirmModal.onCancel}
                style={{ flex: 1, padding: '10px' }}
              >
                Batal (No)
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '10px', backgroundColor: 'var(--accent)' }}
                onClick={confirmModal.onConfirm}
              >
                Ya, Setuju (Yes)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------
// SUB-VIEW: DASHBOARD
// ----------------------------------------------------------------------------------
function DashboardView({ products, transactions, purchases, expenses, formatRupiah, fetchData, filterRange, setFilterRange, startDate, setStartDate, endDate, setEndDate, handleTriggerPrint, showToast, showConfirm, requestWriteAccess }) {
  const [updatingTxId, setUpdatingTxId] = useState(null);
  const [updatingPurId, setUpdatingPurId] = useState(null);
  const [activePreviewImg, setActivePreviewImg] = useState(null);
  const [activeDetailModal, setActiveDetailModal] = useState(null);
  
  // Legend series visibility toggles
  const [showPemasukan, setShowPemasukan] = useState(true);
  const [showPengeluaran, setShowPengeluaran] = useState(true);
  const [showLaba, setShowLaba] = useState(true);

  // Filter items sesuai rentang waktu
  const filterByDate = (items, dateField, getDate = (item) => item[dateField]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return items.filter(item => {
      const itemDate = new Date(getDate(item));
      if (filterRange === 'hari_ini') {
        return itemDate >= today;
      } else if (filterRange === '7_hari') {
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return itemDate >= sevenDaysAgo;
      } else if (filterRange === 'bulan_ini') {
        return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      } else if (filterRange === 'custom') {
        if (!startDate || !endDate) return true;
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        return itemDate >= s && itemDate <= e;
      }
      return true; // semua
    });
  };

  const filteredTx = filterByDate(transactions, 'tanggal');
  const filteredExp = filterByDate(expenses, 'tanggal');
  const filteredPur = filterByDate(
    purchases,
    'tanggal',
    (purchase) => purchase.status === 'Lunas' ? purchase.tanggal_pelunasan || purchase.tanggal : purchase.tanggal
  );

  // Keuangan Metrics (MODEL ARUS KAS SEDERHANA / CASH FLOW)
  const totalOmset = filteredTx.reduce((sum, t) => sum + Number(t.total_harga), 0);
  
  // Pengeluaran 1: Pembelian barang yang sudah dibayar
  const totalBeliBarang = filteredPur.filter(p => p.status === 'Lunas').reduce((sum, p) => sum + Number(p.total_nota), 0);
  
  // Pengeluaran 2: Operasional Harian (bensin, makan, iuran)
  const totalOperasional = filteredExp.reduce((sum, e) => sum + Number(e.jumlah), 0);
  
  // Pengeluaran Utama Toko = Beli Barang + Operasional Harian
  const totalPengeluaran = totalBeliBarang + totalOperasional;
  
  // Laba Bersih = Pemasukan Riil - Pengeluaran Riil
  const labaBersih = totalOmset - totalPengeluaran;

  // PIUTANG (Tempo Pelanggan Belum Lunas)
  const tempoTxs = transactions.filter(t => t.metode_pembayaran === 'Tempo' && t.status_pembayaran === 'Belum Lunas');
  const totalPiutang = tempoTxs.reduce((sum, t) => sum + Number(t.total_harga), 0);

  // HUTANG pembelian tempo yang belum lunas ke supplier.
  const tempoPurchases = purchases.filter(p => p.status === 'Tempo');
  const totalHutang = tempoPurchases.reduce((sum, p) => sum + Number(p.total_nota), 0);

  // Analisis Alert Stok Menipis
  const lowStockProducts = products.filter(p => p.stok_rumah < p.stok_minimum || p.stok_pasar < p.stok_minimum);

  // Tulis status lunas untuk Piutang Pelanggan
  const handleMarkTxAsLunas = (id) => {
    requestWriteAccess(async () => {
      try {
        setUpdatingTxId(id);
        await dbService.updateTransactionStatus(id, 'Lunas');
        showToast('Piutang pelanggan berhasil dilunasi!', 'success');
        fetchData();
      } catch (e) {
        showToast('Gagal melunasi piutang.', 'error');
      } finally {
        setUpdatingTxId(null);
      }
    });
  };

  // Tulis status lunas untuk Hutang ke Supplier
  const handleMarkPurchaseAsLunas = (id) => {
    requestWriteAccess(async () => {
      try {
        setUpdatingPurId(id);
        await dbService.updatePurchaseStatus(id, 'Lunas');
        showToast('Hutang supplier berhasil dilunasi!', 'success');
        fetchData();
      } catch (e) {
        showToast('Gagal melunasi hutang.', 'error');
      } finally {
        setUpdatingPurId(null);
      }
    });
  };

  // ----------------------------------------------------
  // LOGIKA GENERATOR DATA GRAFIK SECARA DINAMIS
  // ----------------------------------------------------
  const getChartData = () => {
    const data = [];
    const now = new Date();
    
    let dates = [];
    if (filterRange === 'hari_ini' || filterRange === '7_hari' || (filterRange === 'custom' && (!startDate || !endDate))) {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        dates.push(d);
      }
    } else if (filterRange === 'bulan_ini') {
      const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= totalDays; i++) {
        dates.push(new Date(now.getFullYear(), now.getMonth(), i));
      }
    } else if (filterRange === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      let current = new Date(start);
      let count = 0;
      // Batasi maksimal 31 hari agar tidak berdesakan di layar HP/PC
      while (current <= end && count < 31) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
        count++;
      }
    } else {
      // Semua periode -> Kelompokkan per bulan untuk 6 bulan terakhir
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        data.push({
          label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
          dateRef: d,
          isMonthly: true
        });
      }
    }

    if (data.length === 0) {
      dates.forEach(d => {
        data.push({
          label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          dateRef: d,
          isMonthly: false
        });
      });
    }

    return data.map(item => {
      let pem = 0;
      let peng = 0;
      let laba = 0;
      if (item.isMonthly) {
        const m = item.dateRef.getMonth();
        const y = item.dateRef.getFullYear();
        
        const txs = transactions.filter(t => {
          const d = new Date(t.tanggal);
          return d.getMonth() === m && d.getFullYear() === y;
        });
        const exps = expenses.filter(e => {
          const d = new Date(e.tanggal);
          return d.getMonth() === m && d.getFullYear() === y;
        });
        const purs = purchases.filter(p => {
          const d = new Date(p.tanggal_pelunasan || p.tanggal);
          return d.getMonth() === m && d.getFullYear() === y && p.status === 'Lunas';
        });

        pem = txs.reduce((sum, t) => sum + Number(t.total_harga), 0);
        const bel = purs.reduce((sum, p) => sum + Number(p.total_nota), 0);
        const op = exps.reduce((sum, e) => sum + Number(e.jumlah), 0);
        peng = bel + op;
        laba = pem - peng;
      } else {
        const dateStr = item.dateRef.toDateString();
        
        const txs = transactions.filter(t => new Date(t.tanggal).toDateString() === dateStr);
        const exps = expenses.filter(e => new Date(e.tanggal).toDateString() === dateStr);
        const purs = purchases.filter(p => new Date(p.tanggal_pelunasan || p.tanggal).toDateString() === dateStr && p.status === 'Lunas');

        pem = txs.reduce((sum, t) => sum + Number(t.total_harga), 0);
        const bel = purs.reduce((sum, p) => sum + Number(p.total_nota), 0);
        const op = exps.reduce((sum, e) => sum + Number(e.jumlah), 0);
        peng = bel + op;
        laba = pem - peng;
      }

      return {
        label: item.label,
        pemasukan: pem,
        pengeluaran: peng,
        laba: laba
      };
    });
  };

  const chartData = getChartData();

  const handleExportBackup = async () => {
    try {
      await downloadExcelBackup({ products, transactions, purchases, expenses });
      showToast('Backup Excel berhasil diunduh.', 'success');
    } catch (error) {
      console.error('Gagal mengekspor backup Excel:', error);
      showToast('Gagal mengekspor backup Excel.', 'error');
    }
  };

  const handleRestoreBackup = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    requestWriteAccess(async () => {
      try {
        const backup = await parseExcelBackup(await file.arrayBuffer());
        const recordCount = backup.products.length + backup.transactions.length + backup.purchases.length + backup.expenses.length;
        showConfirm(
          `PERINGATAN: Pemulihan akan mengganti seluruh data saat ini (${recordCount} data dari file Excel). Tindakan ini tidak dapat dibatalkan. Lanjutkan?`,
          async () => {
            const currentData = { products, transactions, purchases, expenses };
            try {
              await dbService.replaceAllData(backup);
              await fetchData();
              showToast('Database berhasil dipulihkan dari file Excel.', 'success');
            } catch (error) {
              console.error('Gagal memulihkan backup Excel:', error);
              try {
                await dbService.replaceAllData(currentData);
                await fetchData();
                showToast('Pemulihan gagal. Data sebelumnya berhasil dikembalikan.', 'error');
              } catch (rollbackError) {
                console.error('Gagal mengembalikan data sebelum pemulihan:', rollbackError);
                await fetchData();
                showToast('Pemulihan dan pengembalian data sebelumnya gagal. Periksa database sebelum melanjutkan.', 'error');
              }
            }
          }
        );
      } catch (error) {
        console.error('File backup Excel tidak dapat dibaca:', error);
        showToast(error.message || 'File backup Excel tidak valid.', 'error');
      }
    });
  };

  // Hitung nilai maksimum dari series yang aktif agar skala tingginya akurat dan sebanding
  const activeValues = [];
  chartData.forEach(d => {
    if (showPemasukan) activeValues.push(Math.abs(d.pemasukan));
    if (showPengeluaran) activeValues.push(Math.abs(d.pengeluaran));
    if (showLaba) activeValues.push(Math.abs(d.laba));
  });
  const maxVal = Math.max(...activeValues, 500000); // minimal skala 500rb

  return (
    <div>
      {/* Date Filter & Action Buttons */}
      <div className="filter-container no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['hari_ini', '7_hari', 'bulan_ini', 'semua', 'custom'].map(range => (
            <button 
              key={range}
              className={`filter-chip ${filterRange === range ? 'active' : ''}`}
              onClick={() => setFilterRange(range)}
            >
              {range === 'hari_ini' ? 'Hari Ini' : range === '7_hari' ? '7 Hari' : range === 'bulan_ini' ? 'Bulan Ini' : range === 'custom' ? 'Pilih Tanggal' : 'Semua'}
            </button>
          ))}

          {filterRange === 'custom' && (
            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', marginLeft: '8px' }}>
              <input 
                type="date" 
                className="form-control" 
                style={{ padding: '6px 10px', fontSize: '0.85rem', width: '135px' }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>s/d</span>
              <input 
                type="date" 
                className="form-control" 
                style={{ padding: '6px 10px', fontSize: '0.85rem', width: '135px' }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
        
        <button className="btn btn-secondary" onClick={() => handleTriggerPrint('report')} style={{ marginLeft: 'auto' }}>
          <Printer size={16} /> Cetak Laporan Keuangan (PDF)
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid no-print">
        <div 
          className="metric-card" 
          style={{ borderLeft: '5px solid var(--accent)', cursor: 'pointer' }}
          onClick={() => setActiveDetailModal('pemasukan')}
        >
          <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="metric-details">
            <h3>Pemasukan</h3>
            <div className="value">{formatRupiah(totalOmset)}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pemasukan Penjualan (Klik detail)</span>
          </div>
        </div>

        <div 
          className="metric-card" 
          style={{ borderLeft: '5px solid var(--color-danger)', cursor: 'pointer' }}
          onClick={() => setActiveDetailModal('pengeluaran')}
        >
          <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
            <TrendingDown size={24} />
          </div>
          <div className="metric-details">
            <h3>Pengeluaran Toko</h3>
            <div className="value">{formatRupiah(totalPengeluaran)}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Belanja Barang + Biaya Toko (Klik detail)</span>
          </div>
        </div>

        <div 
          className="metric-card" 
          style={{ borderLeft: labaBersih >= 0 ? '5px solid var(--color-success)' : '5px solid var(--color-danger)', cursor: 'pointer' }}
          onClick={() => setActiveDetailModal('laba')}
        >
          <div 
            className="metric-icon-wrapper" 
            style={{ 
              backgroundColor: labaBersih >= 0 ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', 
              color: labaBersih >= 0 ? 'var(--color-success)' : 'var(--color-danger)' 
            }}
          >
            {labaBersih >= 0 ? <DollarSign size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div className="metric-details">
            <h3>{labaBersih >= 0 ? 'Untung Bersih (Laba)' : 'Rugi Toko (Kerugian)'}</h3>
            <div className="value" style={{ color: labaBersih >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {formatRupiah(labaBersih)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {labaBersih >= 0 ? 'Keuntungan bersih Anda (Klik detail)' : 'Toko mengalami kerugian (Klik detail)'}
            </span>
          </div>
        </div>

        <div 
          className="metric-card" 
          style={{ borderLeft: '5px solid var(--color-danger)', cursor: 'pointer' }}
          onClick={() => setActiveDetailModal('hutang')}
        >
          <div className="metric-icon-wrapper" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <ArrowUpRight size={24} />
          </div>
          <div className="metric-details">
            <h3>Hutang Supplier</h3>
            <div className="value" style={{ color: 'var(--color-danger)' }}>{formatRupiah(totalHutang)}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bon Belum Kita Bayar (Klik detail)</span>
          </div>
        </div>

        <div 
          className="metric-card" 
          style={{ borderLeft: '5px solid var(--color-warning)', cursor: 'pointer' }}
          onClick={() => setActiveDetailModal('piutang')}
        >
          <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
            <ArrowDownLeft size={24} />
          </div>
          <div className="metric-details">
            <h3>Piutang Pelanggan</h3>
            <div className="value" style={{ color: 'var(--color-warning)' }}>{formatRupiah(totalPiutang)}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bon Belum Pelanggan Bayar (Klik detail)</span>
          </div>
        </div>
      </div>

      {/* GRAFIK STATISTIK DINAMIS PERBANDINGAN SIDE-BY-SIDE */}
      <div className="panel-card no-print">
        <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
          <span className="panel-title">Perbandingan Grafik Pemasukan, Pengeluaran & Laba</span>
          
          {/* Legenda & Toggle Visibilitas Grafik */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Tampilkan Grafik:</span>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <input 
                type="checkbox" 
                checked={showPemasukan} 
                onChange={() => setShowPemasukan(!showPemasukan)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--accent)' }}>Pemasukan (Omset)</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <input 
                type="checkbox" 
                checked={showPengeluaran} 
                onChange={() => setShowPengeluaran(!showPengeluaran)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-danger)', cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--color-danger)' }}>Pengeluaran</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <input 
                type="checkbox" 
                checked={showLaba} 
                onChange={() => setShowLaba(!showLaba)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-success)', cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--color-success)' }}>Laba / Rugi Bersih</span>
            </label>
          </div>
        </div>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          <div className="chart-bar-container" style={{ minWidth: chartData.length > 7 ? '750px' : 'auto' }}>
            {chartData.map((d, index) => {
              return (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'flex-end', minWidth: '70px', padding: '0 4px' }}>
                  
                  {/* Grup Bar Batang Dinamis Side-by-Side */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', height: '100%', borderBottom: '1px solid var(--border-color)' }}>
                    
                    {/* Bar Pemasukan (Ungu) */}
                    {showPemasukan && (
                      <div 
                        className="chart-bar" 
                        style={{ 
                          flex: 1,
                          height: d.pemasukan === 0 ? '0%' : `${Math.max((d.pemasukan / maxVal) * 100, 2)}%`,
                          background: d.pemasukan === 0 ? 'transparent' : 'linear-gradient(180deg, var(--accent), var(--accent-dark))',
                          minHeight: d.pemasukan === 0 ? '0px' : '5px',
                          border: d.pemasukan === 0 ? 'none' : undefined,
                          borderRadius: '3px 3px 0 0'
                        }}
                      >
                        <div className="chart-bar-tooltip">Omset: {formatRupiah(d.pemasukan)}</div>
                      </div>
                    )}

                    {/* Bar Pengeluaran (Merah) */}
                    {showPengeluaran && (
                      <div 
                        className="chart-bar" 
                        style={{ 
                          flex: 1,
                          height: d.pengeluaran === 0 ? '0%' : `${Math.max((d.pengeluaran / maxVal) * 100, 2)}%`,
                          background: d.pengeluaran === 0 ? 'transparent' : 'linear-gradient(180deg, var(--color-danger), #dc2626)',
                          minHeight: d.pengeluaran === 0 ? '0px' : '5px',
                          border: d.pengeluaran === 0 ? 'none' : undefined,
                          borderRadius: '3px 3px 0 0'
                        }}
                      >
                        <div className="chart-bar-tooltip">Beban: {formatRupiah(d.pengeluaran)}</div>
                      </div>
                    )}

                    {/* Bar Laba/Rugi (Hijau atau Merah) */}
                    {showLaba && (
                      <div 
                        className="chart-bar" 
                        style={{ 
                          flex: 1,
                          height: d.laba === 0 ? '0%' : `${Math.max((Math.abs(d.laba) / maxVal) * 100, 2)}%`,
                          background: d.laba === 0 ? 'transparent' : d.laba >= 0 
                            ? 'linear-gradient(180deg, var(--color-success), #16a34a)' // Untung (Hijau)
                            : 'linear-gradient(180deg, var(--color-danger), #dc2626)',  // Rugi (Merah)
                          minHeight: d.laba === 0 ? '0px' : '5px',
                          border: d.laba === 0 ? 'none' : undefined,
                          borderRadius: '3px 3px 0 0'
                        }}
                      >
                        <div className="chart-bar-tooltip">
                          {d.laba >= 0 ? 'Untung: ' : 'Rugi: '}
                          {formatRupiah(d.laba)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="chart-label" style={{ fontSize: '0.7rem', marginTop: '6px' }}>{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="form-row no-print" style={{ gap: '24px' }}>
        {/* Rincian Keuangan */}
        <div className="panel-card">
          <div className="panel-header">
            <span className="panel-title">Rincian Laba & Pengeluaran</span>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Pemasukan Penjualan (Omset):</span>
                <span style={{ fontWeight: 'bold', marginLeft: 'auto' }}>{formatRupiah(totalOmset)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Belanja Barang Toko (Nota Lunas):</span>
                <span style={{ fontWeight: 'bold', color: 'var(--color-danger)', marginLeft: 'auto' }}>- {formatRupiah(totalBeliBarang)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Biaya Operasional (Bensin/Makan/Iuran):</span>
                <span style={{ fontWeight: 'bold', color: 'var(--color-danger)', marginLeft: 'auto' }}>- {formatRupiah(totalOperasional)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontWeight: 'bold' }}>
                <span>Total Pengeluaran:</span>
                <span style={{ color: 'var(--color-danger)', marginLeft: 'auto' }}>- {formatRupiah(totalPengeluaran)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                <span>Laba/Rugi Bersih Akhir:</span>
                <span style={{ color: labaBersih >= 0 ? 'var(--color-success)' : 'var(--color-danger)', marginLeft: 'auto' }}>
                  {formatRupiah(labaBersih)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stok Menipis */}
        <div className="panel-card">
          <div className="panel-header" style={{ borderLeft: '4px solid var(--color-warning)' }}>
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="var(--color-warning)" /> Peringatan Stok Menipis
            </span>
            <span className="badge badge-warning">{lowStockProducts.length} Barang</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {lowStockProducts.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Semua stok barang aman dan tercukupi.</p>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Barang</th>
                      <th>Stok Rumah</th>
                      <th>Stok Pasar</th>
                      <th>Batas Minimal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: '600' }}>{p.nama}</td>
                        <td style={{ color: p.stok_rumah < p.stok_minimum ? 'var(--color-danger)' : 'inherit', fontWeight: p.stok_rumah < p.stok_minimum ? 'bold' : 'normal' }}>
                          {p.stok_rumah} pcs
                        </td>
                        <td style={{ color: p.stok_pasar < p.stok_minimum ? 'var(--color-danger)' : 'inherit', fontWeight: p.stok_pasar < p.stok_minimum ? 'bold' : 'normal' }}>
                          {p.stok_pasar} pcs
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{p.stok_minimum} pcs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DUA TABEL HUTANG & PIUTANG TEMPO */}
      <div className="form-row no-print" style={{ gap: '24px', marginTop: '24px' }}>
        {/* TABEL PIUTANG PELANGGAN */}
        <div className="panel-card">
          <div className="panel-header" style={{ borderLeft: '4px solid var(--color-warning)' }}>
            <span className="panel-title">Bon Pelanggan Belum Bayar (Piutang)</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {tempoTxs.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Tidak ada piutang tempo yang tertunda.</p>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Pelanggan</th>
                      <th>Total Bon</th>
                      <th>Tanggal Transaksi</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tempoTxs.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 'bold' }}>{t.nama_pelanggan} ({t.lokasi_penjualan})</td>
                        <td style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>{formatRupiah(t.total_harga)}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </td>
                        <td>
                          <button 
                            className="btn btn-primary btn-sm" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleMarkTxAsLunas(t.id)}
                            disabled={updatingTxId === t.id}
                          >
                            {updatingTxId === t.id ? 'Loading...' : 'Sudah Lunas'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* TABEL HUTANG KE SUPPLIER */}
        <div className="panel-card">
          <div className="panel-header" style={{ borderLeft: '4px solid var(--color-danger)' }}>
            <span className="panel-title">Toko Kita Belum Bayar (Hutang Supplier)</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {tempoPurchases.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Toko tidak memiliki hutang ke supplier.</p>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Supplier</th>
                      <th>Total Hutang</th>
                      <th>Tanggal Ambil</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tempoPurchases.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 'bold' }}>
                          {p.nama_supplier}
                          {p.sumber_data === 'Simulasi otomatis (DEMO)' && (
                            <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>{formatRupiah(p.total_nota)}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(p.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </td>
                        <td>
                          <button 
                            className="btn btn-danger btn-sm" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleMarkPurchaseAsLunas(p.id)}
                            disabled={updatingPurId === p.id}
                          >
                            {updatingPurId === p.id ? 'Loading...' : 'Sudah Lunas'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL UTILITAS & BACKUP DATABASE */}
      <div className="panel-card no-print" style={{ marginTop: '24px' }}>
        <div className="panel-header" style={{ borderLeft: '4px solid var(--accent)' }}>
          <span className="panel-title">Utilitas Database & Backup Cadangan Excel</span>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Simpan salinan produk, transaksi, nota pembelian, pengeluaran, dan lampiran dalam workbook Excel (.xlsx). Pemulihan akan mengganti seluruh data yang sedang tersimpan.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            
            <button 
              className="btn btn-secondary" 
              onClick={handleExportBackup}
            >
              Simpan Backup Excel (.xlsx)
            </button>

            <label className="btn btn-secondary" style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}>
              Pulihkan dari Excel (.xlsx)
              <input 
                type="file" 
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ position: 'absolute', top: 0, left: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                onChange={handleRestoreBackup}
              />
            </label>

            {/* Tombol Bersihkan Foto Lama */}
            <button 
              className="btn btn-danger"
              style={{ backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
              onClick={() => requestWriteAccess(() => {
                showConfirm('Apakah Anda yakin ingin membersihkan foto bukti transfer & nota fisik yang sudah berumur lebih dari 3 bulan? Ini akan sangat menghemat ruang database cloud Anda.', () => {
                  try {
                    let clearedCount = 0;
                    const threeMonthsAgo = new Date();
                    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

                    // 1. Bersihkan transaksi lama
                    const txs = JSON.parse(localStorage.getItem('toko_transaksi') || '[]');
                    const updatedTxs = txs.map(t => {
                      if (new Date(t.tanggal) < threeMonthsAgo && t.bukti_pembayaran) {
                        clearedCount++;
                        return { ...t, bukti_pembayaran: "" };
                      }
                      return t;
                    });
                    localStorage.setItem('toko_transaksi', JSON.stringify(updatedTxs));

                    // 2. Bersihkan nota pembelian lama
                    // Fix #1 QA: Gunakan key yang benar 'toko_pembelian'
                    const purs = JSON.parse(localStorage.getItem('toko_pembelian') || '[]');
                    const updatedPurs = purs.map(p => {
                      if (new Date(p.tanggal) < threeMonthsAgo && (p.foto_nota || p.foto_nota_base64)) {
                        clearedCount++;
                        return { ...p, foto_nota: '', foto_nota_base64: '' };
                      }
                      return p;
                    });
                    localStorage.setItem('toko_pembelian', JSON.stringify(updatedPurs));

                    if (clearedCount > 0) {
                      showToast(`Berhasil membersihkan ${clearedCount} foto bukti pembayaran lama!`, 'success');
                      fetchData();
                    } else {
                      showToast('Tidak ada foto bukti pembayaran berumur > 3 bulan.', 'success');
                    }
                  } catch (err) {
                    showToast('Gagal membersihkan foto lama.', 'error');
                  }
                });
              })}
            >
              Bersihkan Foto Bukti Lama (&gt; 3 Bulan)
            </button>
          </div>
        </div>
      </div>

      {/* Pop up preview bukti TF */}
      {activePreviewImg && (
        <div className="modal-overlay" onClick={() => setActivePreviewImg(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <span className="modal-title">Foto Bukti Transfer Pembayaran</span>
              <button className="btn-icon-only btn-sm" onClick={() => setActivePreviewImg(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: '#000' }}>
              <img src={activePreviewImg} alt="Bukti Transfer" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActivePreviewImg(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POP-UP DETAIL METRIK DASHBOARD */}
      {activeDetailModal && (
        <div className="modal-overlay" onClick={() => setActiveDetailModal(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', width: '95%' }}>
            <div className="modal-header">
              <span className="modal-title">
                Detail {activeDetailModal === 'pemasukan' && 'Pemasukan Penjualan'}
                {activeDetailModal === 'pengeluaran' && 'Pengeluaran Toko'}
                {activeDetailModal === 'laba' && 'Untung/Rugi Bersih'}
                {activeDetailModal === 'hutang' && 'Hutang Toko ke Supplier'}
                {activeDetailModal === 'piutang' && 'Piutang Bon Pelanggan'}
              </span>
              <button className="btn-icon-only btn-sm" onClick={() => setActiveDetailModal(null)}>X</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              
              {/* DETAIL PEMASUKAN */}
              {activeDetailModal === 'pemasukan' && (
                <div>
                  <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Daftar semua transaksi penjualan kasir pada periode ini yang menghasilkan total pemasukan <strong>{formatRupiah(totalOmset)}</strong>:
                  </p>
                  {filteredTx.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Tidak ada transaksi penjualan di periode ini.</p>
                  ) : (
                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Pelanggan/Lokasi</th>
                            <th>Barang</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTx.map(t => (
                            <tr key={t.id}>
                              <td style={{ fontSize: '0.8rem' }}>
                                {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </td>
                              <td style={{ fontWeight: '600' }}>
                                {t.nama_pelanggan || 'Umum'} ({t.lokasi_penjualan})
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>
                                {t.items?.map(i => `${i.nama_produk} (${i.jumlah} pcs)`).join(', ')}
                              </td>
                              <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{formatRupiah(t.total_harga)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* DETAIL PENGELUARAN */}
              {activeDetailModal === 'pengeluaran' && (
                <div>
                  <h4 style={{ marginBottom: '8px', color: 'var(--text-main)', borderBottom: '2px solid var(--border-color)', paddingBottom: '4px' }}>
                    1. Belanja Barang Masuk (Lunas) - {formatRupiah(totalBeliBarang)}
                  </h4>
                  {filteredPur.filter(p => p.status === 'Lunas').length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>Tidak ada belanja barang lunas di periode ini.</p>
                  ) : (
                    <div className="table-responsive" style={{ marginBottom: '24px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Supplier</th>
                            <th>Detail Barang</th>
                            <th>Jumlah Nota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPur.filter(p => p.status === 'Lunas').map(p => (
                            <tr key={p.id}>
                              <td style={{ fontSize: '0.8rem' }}>{new Date(p.tanggal_pelunasan || p.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                              <td style={{ fontWeight: '600' }}>
                                {p.nama_supplier}
                                {p.sumber_data === 'Simulasi otomatis (DEMO)' && (
                                  <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                                )}
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>{p.items?.map(i => `${i.nama_produk} (${i.jumlah} pcs)`).join(', ')}</td>
                              <td style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>{formatRupiah(p.total_nota)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <h4 style={{ marginBottom: '8px', color: 'var(--text-main)', borderBottom: '2px solid var(--border-color)', paddingBottom: '4px' }}>
                    2. Biaya Operasional Toko - {formatRupiah(totalOperasional)}
                  </h4>
                  {filteredExp.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tidak ada biaya operasional dicatat di periode ini.</p>
                  ) : (
                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Kategori</th>
                            <th>Keperluan</th>
                            <th>Jumlah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExp.map(e => (
                            <tr key={e.id}>
                              <td style={{ fontSize: '0.8rem' }}>{new Date(e.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                              <td><span className="badge badge-warning">{e.kategori}</span></td>
                              <td style={{ fontSize: '0.8rem' }}>
                                {e.keterangan || '-'}
                                {e.sumber_data === 'Simulasi otomatis (DEMO)' && (
                                  <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                                )}
                              </td>
                              <td style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>{formatRupiah(e.jumlah)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* DETAIL UNTUNG / RUGI BERSIH */}
              {activeDetailModal === 'laba' && (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Pemasukan Penjualan (+)</span>
                      <strong style={{ color: 'var(--color-success)' }}>{formatRupiah(totalOmset)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Belanja Barang Toko (Lunas) (-)</span>
                      <strong style={{ color: 'var(--color-danger)' }}>- {formatRupiah(totalBeliBarang)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Biaya Operasional Toko (-)</span>
                      <strong style={{ color: 'var(--color-danger)' }}>- {formatRupiah(totalOperasional)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>
                      <span>Laba Bersih Akhir:</span>
                      <span style={{ color: labaBersih >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{formatRupiah(labaBersih)}</span>
                    </div>
                  </div>

                  <h4 style={{ marginBottom: '8px' }}>Rincian Harian Laba/Rugi:</h4>
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Hari/Tanggal</th>
                          <th>Omset</th>
                          <th>Pengeluaran</th>
                          <th>Laba/Rugi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((d, idx) => (
                          <tr key={idx}>
                            <td>{d.label}</td>
                            <td style={{ color: 'var(--color-success)' }}>{formatRupiah(d.pemasukan)}</td>
                            <td style={{ color: 'var(--color-danger)' }}>{formatRupiah(d.pengeluaran)}</td>
                            <td style={{ fontWeight: 'bold', color: d.laba >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {formatRupiah(d.laba)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DETAIL HUTANG SUPPLIER */}
              {activeDetailModal === 'hutang' && (
                <div>
                  <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Daftar hutang pembelian barang ke supplier yang belum dilunasi:
                  </p>
                  {tempoPurchases.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Tidak ada hutang ke supplier yang terutang.</p>
                  ) : (
                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Total Hutang</th>
                            <th>Tanggal Ambil</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempoPurchases.map(p => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 'bold' }}>
                                {p.nama_supplier}
                                {p.sumber_data === 'Simulasi otomatis (DEMO)' && (
                                  <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>{formatRupiah(p.total_nota)}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {new Date(p.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </td>
                              <td>
                                <button 
                                  className="btn btn-danger btn-sm" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    handleMarkPurchaseAsLunas(p.id);
                                    setActiveDetailModal(null);
                                  }}
                                  disabled={updatingPurId === p.id}
                                >
                                  {updatingPurId === p.id ? 'Loading...' : 'Set Lunas'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* DETAIL PIUTANG PELANGGAN */}
              {activeDetailModal === 'piutang' && (
                <div>
                  <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Daftar bon belanja pelanggan yang belum dilunasi:
                  </p>
                  {tempoTxs.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Tidak ada piutang bon dari pelanggan.</p>
                  ) : (
                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Pelanggan</th>
                            <th>Total Bon</th>
                            <th>Tanggal Jual</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempoTxs.map(t => (
                            <tr key={t.id}>
                              <td style={{ fontWeight: 'bold' }}>{t.nama_pelanggan} ({t.lokasi_penjualan})</td>
                              <td style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>{formatRupiah(t.total_harga)}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </td>
                              <td>
                                <button 
                                  className="btn btn-primary btn-sm" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    handleMarkTxAsLunas(t.id);
                                    setActiveDetailModal(null);
                                  }}
                                  disabled={updatingTxId === t.id}
                                >
                                  {updatingTxId === t.id ? 'Loading...' : 'Set Lunas'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveDetailModal(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------
// SUB-VIEW: POS KASIR (Kini dilengkapi Riwayat Penjualan Langsung & Bukti Transfer)
// ----------------------------------------------------------------------------------
function PosView({ products, transactions, formatRupiah, fetchData, setLastTxData, handleTriggerPrint, showToast, requestWriteAccess }) {
  const [kasirLokasi, setKasirLokasi] = useState('Pasar'); // Pasar / Rumah
  // Fix #1: filter lokasi di riwayat kasir
  const [filterRiwayatLokasi, setFilterRiwayatLokasi] = useState('Semua');
  // Fix #6: expand riwayat lebih banyak
  const [riwayatLimit, setRiwayatLimit] = useState(10);
  const [riwayatSearchQuery, setRiwayatSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [cart, setCart] = useState([]);
  
  // Checkout form state
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [customerName, setCustomerName] = useState('');
  const [tfFileBase64, setTfFileBase64] = useState('');
  const [previewTfUrl, setPreviewTfUrl] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Modal preview bukti TF
  const [activeTfPreview, setActiveTfPreview] = useState(null);

  const categories = ['Semua', ...new Set(products.map(p => p.kategori))];

  const filteredProducts = products.filter(p => {
    const matchSearch = p.nama.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        p.kategori.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = selectedCategory === 'Semua' || p.kategori === selectedCategory;
    return matchSearch && matchCat;
  });
  const filteredHistory = transactions.filter(tx => {
    if (filterRiwayatLokasi !== 'Semua' && tx.lokasi_penjualan !== filterRiwayatLokasi) return false;
    const query = riwayatSearchQuery.trim().toLocaleLowerCase('id-ID');
    if (!query) return true;
    const searchableValues = [
      tx.nama_pelanggan,
      tx.lokasi_penjualan,
      tx.metode_pembayaran,
      tx.status_pembayaran,
      tx.tanggal,
      new Date(tx.tanggal).toLocaleString('id-ID'),
      tx.total_harga,
      formatRupiah(tx.total_harga),
      ...(tx.items || []).map(item => item.nama_produk)
    ];
    return searchableValues.some(value => String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });

  useEffect(() => {
    setRiwayatLimit(10);
  }, [filterRiwayatLokasi, riwayatSearchQuery]);

  const handleTfFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (compressedBase64) => {
      setTfFileBase64(compressedBase64);
      setPreviewTfUrl(compressedBase64);
    });
  };

  const addToCart = (product) => {
    const currentStock = kasirLokasi === 'Pasar' ? product.stok_pasar : product.stok_rumah;
    
    if (currentStock <= 0) {
      showToast(`Stok "${product.nama}" di ${kasirLokasi} kosong!`, 'error');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= currentStock) {
          showToast(`Pembelian melebihi stok yang tersedia (${currentStock} pcs).`, 'error');
          return prev;
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, {
        id: product.id,
        nama: product.nama,
        harga_beli: product.harga_beli_default,
        harga_jual: '',
        qty: 1
      }];
    });
  };

  const updateQty = (id, change, maxStock) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.qty + change;
        if (nextQty > maxStock) {
          showToast(`Jumlah melebihi stok yang tersedia (${maxStock} pcs).`, 'error');
          return item;
        }
        return nextQty > 0 ? { ...item, qty: nextQty } : item;
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const totalBelanja = cart.reduce((sum, item) => sum + (parseNominal(item.harga_jual) * item.qty), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const itemWithoutValidPrice = cart.find((item) => parseNominal(item.harga_jual) <= 0);
    if (itemWithoutValidPrice) {
      showToast(`Masukkan harga jual lebih dari Rp0 untuk "${itemWithoutValidPrice.nama}".`, 'error');
      return;
    }
    if (paymentMethod === 'Tempo' && !customerName.trim()) {
      showToast('Wajib memasukkan Nama Pelanggan untuk TEMPO!', 'error');
      return;
    }

    const txPayload = {
      lokasi_penjualan: kasirLokasi,
      total_harga: totalBelanja,
      metode_pembayaran: paymentMethod,
      status_pembayaran: paymentMethod === 'Tempo' ? 'Belum Lunas' : 'Lunas',
      nama_pelanggan: customerName,
      bukti_pembayaran: paymentMethod === 'Transfer' ? tfFileBase64 : null, // Bukti TF
      items: cart.map(item => ({
        produk_id: item.id,
        nama_produk: item.nama,
        jumlah: item.qty,
        harga_beli_saat_ini: item.harga_beli,
        harga_jual_saat_ini: parseNominal(item.harga_jual)
      }))
    };

    requestWriteAccess(async () => {
      try {
        const tx = await dbService.createTransaction(txPayload);
        setLastTxData({ ...txPayload, id: tx?.id, tanggal: new Date().toISOString() });
        setCart([]);
        setCustomerName('');
        setTfFileBase64('');
        setPreviewTfUrl('');
        setCheckoutSuccess(true);
        showToast('Transaksi penjualan sukses disimpan!', 'success');
        fetchData();
      } catch (e) {
        showToast('Gagal menyimpan transaksi: ' + e.message, 'error');
      }
    });
  };

  // Fix #4: Gunakan lastTxData (snapshot sebelum cart dikosongkan) untuk struk WA
  const getWhatsAppReceiptLink = (txData) => {
    if (!txData) return '#';
    const dateStr = new Date(txData.tanggal || Date.now()).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    let text = `*STRUK BELANJA KODRI ELEKTRONIK*\n`;
    text += `=============================\n`;
    text += `Tanggal: ${dateStr}\n`;
    text += `Kasir: ${txData.lokasi_penjualan}\n`;
    text += `Pelanggan: ${txData.nama_pelanggan || '-'}\n`;
    text += `Metode: ${txData.metode_pembayaran}\n`;
    text += `=============================\n`;
    
    txData.items.forEach(item => {
      text += `- ${item.nama_produk}\n  ${item.jumlah} x ${formatRupiah(item.harga_jual_saat_ini)} = ${formatRupiah(item.jumlah * item.harga_jual_saat_ini)}\n`;
    });
    
    text += `=============================\n`;
    text += `*TOTAL: ${formatRupiah(txData.total_harga)}*\n\n`;
    text += `Terima kasih atas kunjungannya! 🙏`;
    
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="pos-view-container">
      <div className="pos-layout">
        {/* Katalog Barang (Kiri) */}
        <div className="pos-catalog no-print">
          <div style={{ gap: '16px' }} className="form-row">
            <div style={{ flex: '0 0 200px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Pilih Lokasi Jualan:</label>
              <select 
                className="form-control" 
                value={kasirLokasi} 
                onChange={(e) => {
                  const newLokasi = e.target.value;
                  // Fix #22: Konfirmasi jika keranjang tidak kosong sebelum ganti lokasi
                  if (cart.length > 0) {
                    if (!window.confirm(`Ganti lokasi ke "${newLokasi}"? Keranjang belanja yang sudah diisi (${cart.length} item) akan dikosongkan.`)) {
                      return;
                    }
                  }
                  setKasirLokasi(newLokasi);
                  setCart([]); 
                }}
                style={{ fontWeight: 'bold', borderColor: 'var(--accent)' }}
              >
                <option value="Pasar">Pasar</option>
                <option value="Rumah">Rumah</option>
              </select>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Cari Nama / Jenis Barang:</label>
              <input 
                type="text" 
                placeholder="Ketik merek lampu, kabel, baterai..." 
                className="form-control"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-container">
            {categories.map(cat => (
              <button 
                key={cat} 
                className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="pos-grid">
            {filteredProducts.map(p => {
              const currentStock = kasirLokasi === 'Pasar' ? p.stok_pasar : p.stok_rumah;
              const isLow = currentStock < p.stok_minimum;
              return (
                <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{p.kategori}</span>
                    <div className="product-name" style={{ fontSize: '0.9rem' }}>{p.nama}</div>
                  </div>
                  <div>
                    <div className="product-price" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Harga ditentukan saat transaksi</div>
                    <div className="product-stocks">
                      <span className="stock-tag">
                        <span>Stok {kasirLokasi}:</span>
                        <strong style={{ color: currentStock <= 0 ? 'var(--color-danger)' : isLow ? 'var(--color-warning)' : 'inherit' }}>
                          {currentStock} pcs
                        </strong>
                      </span>
                      <span className="stock-tag" style={{ textAlign: 'right' }}>
                        <span>Min:</span>
                        <strong>{p.stok_minimum}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Keranjang Belanja (Kanan) */}
        <div className="pos-cart no-print">
          <div className="panel-header" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={18} /> Belanjaan ({cart.reduce((sum, i) => sum + i.qty, 0)})
            </span>
            <span className="badge badge-info">{kasirLokasi}</span>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '12px' }}>
                <ShoppingCart size={32} strokeWidth={1.5} />
                <p style={{ fontSize: '0.85rem', textAlign: 'center' }}>Keranjang belanja kosong.<br/>Tekan nama barang di kiri.</p>
              </div>
            ) : (
              cart.map(item => {
                const productRef = products.find(p => p.id === item.id);
                const maxStock = kasirLokasi === 'Pasar' ? productRef?.stok_pasar : productRef?.stok_rumah;
                return (
                  <div key={item.id} className="cart-item">
                    <div className="cart-item-details">
                      <div className="cart-item-name" style={{ fontSize: '0.85rem' }}>{item.nama}</div>
                      <label style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Harga jual per unit
                        <div className="input-group" style={{ marginTop: '3px' }}>
                          <span className="input-group-addon">Rp</span>
                          <NominalInput
                            required
                            className="form-control"
                            aria-label={`Harga jual per unit ${item.nama}`}
                            placeholder="Isi harga"
                            value={item.harga_jual}
                            onValueChange={(value) => setCart((prev) => prev.map((cartItem) => (
                              cartItem.id === item.id ? { ...cartItem, harga_jual: value } : cartItem
                            )))}
                          />
                        </div>
                      </label>
                      {parseNominal(item.harga_jual) > 0 && parseNominal(item.harga_jual) < Number(item.harga_beli) && (
                        <small style={{ display: 'block', color: 'var(--color-warning)', marginTop: '4px' }}>
                          Di bawah modal {formatRupiah(item.harga_beli)}; transaksi tetap dapat dilanjutkan.
                        </small>
                      )}
                      <div className="cart-item-price" style={{ marginTop: '4px' }}>
                        Subtotal: {formatRupiah(parseNominal(item.harga_jual) * item.qty)}
                      </div>
                    </div>
                    <div className="cart-item-qty">
                      <button className="qty-btn" onClick={() => updateQty(item.id, -1, maxStock)}>-</button>
                      <span className="qty-val">{item.qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(item.id, 1, maxStock)}>+</button>
                      <button 
                        className="btn-icon-only btn-sm" 
                        style={{ color: 'var(--color-danger)', borderColor: 'transparent', marginLeft: '6px' }}
                        onClick={() => removeFromCart(item.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {cart.length > 0 && (
            <div className="cart-summary">
              <div className="summary-row">
                <span>Subtotal:</span>
                <span>{formatRupiah(totalBelanja)}</span>
              </div>
              
              <div className="form-group" style={{ marginTop: '10px' }}>
                <label>Nama Pelanggan (Wajib jika tempo/bon):</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="misal: Pak Joko, Bu RT"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Metode Bayar:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['Tunai', 'Transfer', 'Tempo'].map(method => (
                    <button
                      key={method}
                      type="button"
                      className={`btn btn-secondary ${paymentMethod === method ? 'btn-primary' : ''}`}
                      style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                      onClick={() => {
                        setPaymentMethod(method);
                        if (method !== 'Transfer') {
                          setTfFileBase64('');
                          setPreviewTfUrl('');
                        }
                      }}
                    >
                      {method === 'Tempo' ? 'Tempo (Bon)' : method}
                    </button>
                  ))}
                </div>
              </div>

              {/* INPUT FOTO BUKTI TRANSFER (Hanya muncul jika Transfer) */}
              {paymentMethod === 'Transfer' && (
                <div className="form-group" style={{ border: '1px dashed var(--accent)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                    <Camera size={14} /> Bukti Transfer (Opsional):
                  </label>
                  <input 
                    type="file" 
                    accept="image/*"
                    className="form-control"
                    onChange={handleTfFileChange}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', marginTop: '4px' }}
                  />
                  {previewTfUrl && (
                    <div style={{ marginTop: '8px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                      <img src={previewTfUrl} alt="Screenshot TF" style={{ height: '100%', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>
              )}

              <div className="summary-row total">
                <span>TOTAL:</span>
                <span>{formatRupiah(totalBelanja)}</span>
              </div>

              <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }} onClick={handleCheckout}>
                Simpan Transaksi ({paymentMethod})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL RIWAYAT PENJUALAN TERAKHIR */}
      <div className="panel-card no-print" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <span className="panel-title">Riwayat Penjualan Kasir Terkini</span>
          {/* Fix #1: Filter lokasi di riwayat kasir */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['Semua', 'Pasar', 'Rumah'].map(lok => (
              <button
                key={lok}
                type="button"
                className={`filter-chip ${filterRiwayatLokasi === lok ? 'active' : ''}`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setFilterRiwayatLokasi(lok)}
              >{lok}</button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="search"
                className="form-control"
                aria-label="Cari riwayat transaksi kasir"
                placeholder="Cari pelanggan, barang, tanggal, metode bayar, atau nominal..."
                value={riwayatSearchQuery}
                onChange={(event) => setRiwayatSearchQuery(event.target.value)}
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>
          {transactions.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>Belum ada transaksi penjualan yang tercatat.</p>
          ) : filteredHistory.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>Tidak ada transaksi yang cocok dengan pencarian.</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Waktu/Tanggal</th>
                    <th>Lokasi</th>
                    <th>Pelanggan</th>
                    <th>Detail Barang Belanjaan</th>
                    <th>Metode Pembayaran</th>
                    <th>Total Belanja</th>
                    <th>Bukti TF</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.slice(0, riwayatLimit).map(tx => (
                    <tr key={tx.id}>
                      <td style={{ fontSize: '0.85rem' }}>
                        <div>{new Date(tx.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        {tx.metode_pembayaran === 'Tempo' && tx.status_pembayaran === 'Lunas' && tx.tanggal_pelunasan && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontWeight: '600', marginTop: '2px' }}>
                            ✓ Lunas: {new Date(tx.tanggal_pelunasan).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${tx.lokasi_penjualan === 'Pasar' ? 'badge-success' : 'badge-info'}`}>
                          {tx.lokasi_penjualan}
                        </span>
                      </td>
                      <td style={{ fontWeight: '600' }}>
                        {tx.nama_pelanggan || 'Umum'}
                        {tx.sumber_data === 'Simulasi otomatis (DEMO)' && (
                          <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.items?.map(i => `${i.nama_produk} (${i.jumlah} pcs)`).join(', ')}
                      </td>
                      <td>
                        <span className={`badge ${tx.metode_pembayaran === 'Tempo' ? 'badge-danger' : 'badge-success'}`}>
                          {tx.metode_pembayaran}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{formatRupiah(tx.total_harga)}</td>
                      <td>
                        {tx.bukti_pembayaran ? (
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', fontSize: '0.72rem' }}
                            onClick={() => setActiveTfPreview(tx.bukti_pembayaran)}
                          >
                            <Eye size={10} /> Bukti TF
                          </button>
                        ) : tx.metode_pembayaran === 'Transfer' ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tidak diunggah</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Fix #6: Tombol lihat lebih banyak riwayat */}
          {filteredHistory.length > riwayatLimit && (
            <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setRiwayatLimit(prev => prev + 10)}
                style={{ fontSize: '0.8rem' }}
              >
                Lihat 10 Riwayat Berikutnya (dari {filteredHistory.length} transaksi)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview Bukti TF di Kasir */}
      {activeTfPreview && (
        <div className="modal-overlay" onClick={() => setActiveTfPreview(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <span className="modal-title">Foto Bukti Transfer Pembayaran</span>
              <button className="btn-icon-only btn-sm" onClick={() => setActiveTfPreview(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: '#000' }}>
              <img src={activeTfPreview} alt="Bukti Transfer" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveTfPreview(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sukses Transaksi / WhatsApp Share */}
      {checkoutSuccess && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)' }}>
                <CheckCircle size={20} /> Transaksi Sukses!
              </span>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '30px 24px' }}>
              <div style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={36} />
              </div>
              {/* Fix #4: Tampilkan total dari lastTxData snapshot, bukan cart yang sudah kosong */}
              <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{formatRupiah(lastTxData?.total_harga || 0)}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px' }}>
                Transaksi berhasil disimpan. Stok otomatis berkurang di database.
              </p>
              
              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleTriggerPrint('receipt')}
                >
                  <Printer size={18} /> Cetak Struk Belanjaan (Thermal 58mm)
                </button>
                <a 
                  href={getWhatsAppReceiptLink(lastTxData)} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none', backgroundColor: '#25D366', color: 'white', border: 'none' }}
                >
                  <Send size={18} /> Kirim Struk via WhatsApp
                </a>
                <button className="btn btn-secondary" onClick={() => setCheckoutSuccess(false)}>
                  Tutup & Mulai Transaksi Baru
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------
// SUB-VIEW: STOK BARANG / KATALOG
// ----------------------------------------------------------------------------------
function InventoryView({ products, purchases, formatRupiah, fetchData, showToast, showConfirm, handleTriggerPrint, setPrintProducts, requestWriteAccess }) {
  return (
    <div className="inventory-view">
      <PurchasesView
        products={products}
        purchases={purchases}
        formatRupiah={formatRupiah}
        fetchData={fetchData}
        showToast={showToast}
        requestWriteAccess={requestWriteAccess}
      />
      <ProductsView
        products={products}
        formatRupiah={formatRupiah}
        fetchData={fetchData}
        showToast={showToast}
        showConfirm={showConfirm}
        handleTriggerPrint={handleTriggerPrint}
        setPrintProducts={setPrintProducts}
        requestWriteAccess={requestWriteAccess}
      />
    </div>
  );
}

function ProductsView({ products, formatRupiah, fetchData, showToast, showConfirm, handleTriggerPrint, setPrintProducts, requestWriteAccess }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua');
  const [stockFilter, setStockFilter] = useState('Semua');
  
  const [formData, setFormData] = useState({
    nama: '',
    kategori: '',
    harga_beli_default: '',
    stok_minimum: 5,
    stok_rumah: 0,
    stok_pasar: 0
  });
  const [selectedProductId, setSelectedProductId] = useState(null);
  const productBeingEdited = products.find((product) => String(product.id) === String(selectedProductId));
  const currentTotal = productBeingEdited
    ? Number(productBeingEdited.stok_rumah) + Number(productBeingEdited.stok_pasar) + Number(productBeingEdited.stok_belum_dialokasikan || 0)
    : 0;

  const filteredProducts = useMemo(() => products.filter(p =>
    (p.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.kategori.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (categoryFilter === 'Semua' || p.kategori === categoryFilter) &&
    (stockFilter === 'Semua' ||
      (stockFilter === 'Menipis' && (p.stok_rumah < p.stok_minimum || p.stok_pasar < p.stok_minimum)) ||
      (stockFilter === 'Belum dialokasikan' && Number(p.stok_belum_dialokasikan) > 0))
  ), [products, searchQuery, categoryFilter, stockFilter]);
  const categories = [...new Set(products.map((product) => product.kategori))].sort((a, b) => a.localeCompare(b, 'id'));
  useEffect(() => {
    setPrintProducts(filteredProducts);
  }, [filteredProducts, setPrintProducts]);

  const handleOpenEdit = (product) => {
    setSelectedProductId(product.id);
    setFormData({
      nama: product.nama,
      kategori: product.kategori,
      harga_beli_default: product.harga_beli_default !== undefined && product.harga_beli_default !== null ? product.harga_beli_default : '',
      stok_minimum: product.stok_minimum,
      stok_rumah: product.stok_rumah,
      stok_pasar: product.stok_pasar
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const distributedTotal = Number(formData.stok_rumah) + Number(formData.stok_pasar);
    if (distributedTotal !== currentTotal) {
      showToast(`Total distribusi harus tetap ${currentTotal} pcs.`, 'error');
      return;
    }
    requestWriteAccess(async () => {
      try {
        await dbService.updateProduct(selectedProductId, {
          ...formData,
          harga_beli_default: Number(formData.harga_beli_default) || 0,
          stok_rumah: Number(formData.stok_rumah) || 0,
          stok_pasar: Number(formData.stok_pasar) || 0,
          stok_belum_dialokasikan: 0,
          stok_minimum: Number(formData.stok_minimum) || 0
        });
        setShowEditModal(false);
        showToast('Detail dan distribusi stok diperbarui tanpa mengubah total barang.', 'success');
        fetchData();
      } catch (err) {
        console.error('Gagal menyimpan penyesuaian produk:', err);
        showToast(`Gagal menyimpan penyesuaian: ${err.message || 'cek koneksi Supabase'}`, 'error');
      }
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }} className="no-print">
        <div style={{ flex: '1 1 220px', maxWidth: '400px' }}>
          <input 
            type="text" 
            placeholder="Cari barang di katalog..." 
            className="form-control"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="form-control" aria-label="Filter kategori stok" style={{ width: 'auto', minWidth: '145px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="Semua">Semua kategori</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select className="form-control" aria-label="Filter kondisi stok" style={{ width: 'auto', minWidth: '165px' }} value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
          <option value="Semua">Semua kondisi stok</option>
          <option value="Menipis">Stok menipis</option>
          <option value="Belum dialokasikan">Belum dialokasikan</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => handleTriggerPrint('stock')}>
          <Printer size={16} /> Cetak Laporan Stok
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleTriggerPrint('stocktake')}>
          <Printer size={16} /> Cetak Lembar Opname
        </button>
      </div>

      <div className="panel-card no-print">
        <div className="panel-header">
          <span className="panel-title">Daftar Stok Produk Terkini</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Nama Barang</th>
                  <th>Jenis (Kategori)</th>
                  <th>Harga Beli (Modal)</th>
                  <th>Stok Rumah (Gudang)</th>
                  <th>Stok Pasar</th>
                  <th>Belum Dialokasikan</th>
                  <th>Total Stok</th>
                  <th>Batas Minimum</th>
                  <th className="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const lowRumah = p.stok_rumah < p.stok_minimum;
                  const lowPasar = p.stok_pasar < p.stok_minimum;
                  const totalStok = (Number(p.stok_rumah) || 0) + (Number(p.stok_pasar) || 0) + (Number(p.stok_belum_dialokasikan) || 0);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: '600' }}>{p.nama}</td>
                      <td>
                        <span className="badge badge-info">{p.kategori}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatRupiah(p.harga_beli_default)}</td>
                      <td style={{ fontWeight: lowRumah ? 'bold' : 'normal', color: lowRumah ? 'var(--color-danger)' : 'inherit' }}>
                        {p.stok_rumah} pcs {lowRumah && '⚠️'}
                      </td>
                      <td style={{ fontWeight: lowPasar ? 'bold' : 'normal', color: lowPasar ? 'var(--color-danger)' : 'inherit' }}>
                        {p.stok_pasar} pcs {lowPasar && '⚠️'}
                      </td>
                      <td style={{ fontWeight: p.stok_belum_dialokasikan ? 'bold' : 'normal', color: p.stok_belum_dialokasikan ? 'var(--color-warning)' : 'inherit' }}>
                        {p.stok_belum_dialokasikan} pcs
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{totalStok} pcs</td>
                      <td>{p.stok_minimum} pcs</td>
                      <td className="no-print" style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => requestWriteAccess(() => handleOpenEdit(p))}>
                          Atur Stok
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '6px 10px' }}
                          onClick={() => requestWriteAccess(() => {
                            showConfirm(`Apakah Anda yakin ingin menghapus produk "${p.nama}" dari katalog?`, async () => {
                              try {
                                await dbService.deleteProduct(p.id);
                                showToast(`Produk "${p.nama}" berhasil dihapus.`, 'success');
                                fetchData();
                              } catch (e) {
                                showToast('Gagal menghapus produk.', 'error');
                              }
                            });
                          })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Edit Product */}
      {showEditModal && (
        <div className="modal-overlay no-print">
          <div className="modal-container">
            <div className="modal-header">
              <span className="modal-title">Atur Produk & Distribusi Stok</span>
              <button className="btn-icon-only btn-sm" onClick={() => setShowEditModal(false)}>X</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nama Barang:</label>
                  <input 
                    type="text" 
                    required 
                    className="form-control" 
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Kategori:</label>
                  <input 
                    type="text" 
                    required 
                    className="form-control" 
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Harga Beli (Modal):</label>
                  <div className="input-group">
                    <span className="input-group-addon">Rp</span>
                    <NominalInput
                      className="form-control"
                      value={formData.harga_beli_default}
                      readOnly
                    />
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>Dihitung otomatis dari transaksi pembelian.</small>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Stok Rumah:</label>
                    <input 
                      type="number" 
                      required 
                      min="0"
                      step="1"
                      className="form-control"
                      value={formData.stok_rumah}
                      onChange={(e) => setFormData({ ...formData, stok_rumah: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Stok Pasar:</label>
                    <input 
                      type="number" 
                      required 
                      min="0"
                      step="1"
                      className="form-control"
                      value={formData.stok_pasar}
                      onChange={(e) => setFormData({ ...formData, stok_pasar: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <p style={{ marginTop: '-8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Total fisik yang harus dialokasikan: {currentTotal} pcs. Jumlah Stok Rumah + Stok Pasar wajib tepat sama dengan total ini.
                </p>
                <div className="form-group">
                  <label>Batas Minim Stok Alert (Peringatan):</label>
                  <input 
                    type="number" 
                    required 
                    className="form-control"
                    value={formData.stok_minimum}
                    onChange={(e) => setFormData({ ...formData, stok_minimum: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------
// PURCHASE FORM AND HISTORY WITHIN THE INVENTORY FEATURE
// ----------------------------------------------------------------------------------
function PurchasesView({ products, purchases, formatRupiah, fetchData, showToast, requestWriteAccess }) {
  const [supplierName, setSupplierName] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('Lunas'); // Lunas / Tempo

  const [activePreviewNotaImg, setActivePreviewNotaImg] = useState(null);
  
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [inputQty, setInputQty] = useState(1);
  const [purchaseTotal, setPurchaseTotal] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const matchedProduct = products.find((product) => product.nama.trim().toLocaleLowerCase() === productName.trim().toLocaleLowerCase());

  useEffect(() => {
    if (matchedProduct) {
      setProductCategory(matchedProduct.kategori);
    }
  }, [matchedProduct]);

  const totalNota = parseNominal(purchaseTotal);

  const handleReceiveGoods = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!supplierName.trim()) {
      showToast('Wajib mengisi Nama Supplier!', 'error');
      return;
    }
    if (!productName.trim() || !productCategory.trim()) {
      showToast('Nama dan jenis produk wajib diisi.', 'error');
      return;
    }

    const payload = {
      nama_supplier: supplierName,
      status: purchaseStatus,
      items: [{
        ...(matchedProduct ? { produk_id: matchedProduct.id } : {}),
        nama_produk: productName.trim(),
        kategori: productCategory.trim(),
        jumlah: Number(inputQty),
        harga_beli: totalNota / Number(inputQty)
      }]
    };

    requestWriteAccess(async () => {
      try {
        setIsSaving(true);
        await dbService.createPurchase(payload);
        const receivedName = productName.trim();
        const receivedQuantity = Number(inputQty);
        const wasNewProduct = !matchedProduct;
        setProductName('');
        setProductCategory('');
        setInputQty(1);
        setPurchaseTotal('');
        setPurchaseStatus('Lunas');
        try {
          await fetchData({ showLoading: false, throwOnError: true });
          showToast(`${receivedName} diterima: ${receivedQuantity} pcs masuk stok belum dialokasikan dan nota pembelian tercatat.${wasNewProduct ? ' Produk baru dibuat dari transaksi ini.' : ''}`, 'success');
        } catch (refreshError) {
          console.error('Penerimaan tersimpan, tetapi data stok gagal dimuat ulang:', refreshError);
          showToast('Penerimaan dan stok sudah tersimpan, tetapi tampilan belum diperbarui. Muat ulang halaman.', 'error');
        }
      } catch (err) {
        console.error('Gagal menerima barang dan memperbarui stok:', err);
        showToast(`Gagal menerima barang: ${err.message || 'cek koneksi database'}`, 'error');
      } finally {
        setIsSaving(false);
      }
    });
  };

  return (
    <div className="purchase-layout">
      <form onSubmit={handleReceiveGoods} className="panel-card no-print" style={{ gridColumn: '1 / -1' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span className="panel-title">Penerimaan Barang</span>
        </div>
        <div className="panel-body">
          <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Catat barang yang benar-benar dibeli. Produk baru otomatis masuk katalog melalui transaksi ini; jumlahnya menjadi stok belum dialokasikan sampai dibagi ke Rumah dan Pasar.
          </p>
          <div className="form-row">
            <div className="form-group" style={{ flex: '1 1 220px' }}>
              <label>Supplier / Toko:</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="Nama supplier"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: '2 1 240px' }}>
              <label>Nama Barang:</label>
              <input
                type="text"
                className="form-control"
                required
                list="known-inventory-products"
                placeholder="misal: Kabel NYM 2x1.5"
                value={productName}
                onChange={(e) => {
                  const name = e.target.value;
                  setProductName(name);
                  const existing = products.find((product) => product.nama.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
                  if (existing) setProductCategory(existing.kategori);
                  else setProductCategory('');
                }}
              />
              <datalist id="known-inventory-products">
                {products.map(product => (
                  <option key={product.id} value={product.nama} />
                ))}
              </datalist>
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label>Jenis / Kategori:</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="misal: Kabel"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                readOnly={Boolean(matchedProduct)}
              />
            </div>
            <div className="form-group" style={{ flex: '0 1 120px' }}>
              <label>Jumlah:</label>
              <input
                type="number"
                className="form-control"
                min="1"
                step="1"
                required
                value={inputQty}
                onChange={(e) => setInputQty(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 190px' }}>
              <label>Total Harga Beli (Nota):</label>
              <div className="input-group">
                <span className="input-group-addon">Rp</span>
                <NominalInput
                  className="form-control"
                  required
                  value={purchaseTotal}
                  onValueChange={setPurchaseTotal}
                />
              </div>
            </div>
          </div>

          <div style={{ margin: '0 0 18px', padding: '12px 14px', borderRadius: '8px', background: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>{matchedProduct ? `Stok fisik ${matchedProduct.nama} saat ini: ${Number(matchedProduct.stok_rumah) + Number(matchedProduct.stok_pasar) + Number(matchedProduct.stok_belum_dialokasikan || 0)} pcs` : 'Produk baru akan dibuat otomatis dari transaksi ini.'}</span>
            <span>Belum dialokasikan setelah diterima: <strong>{(Number(matchedProduct?.stok_belum_dialokasikan) || 0) + (Number(inputQty) || 0)} pcs</strong></span>
            <span>Nilai pembelian: <strong>{formatRupiah(totalNota)}</strong></span>
          </div>

          <div className="form-row" style={{ alignItems: 'center' }}>
            <div className="form-group" style={{ flex: '1 1 220px', marginBottom: 0 }}>
              <label>Status pembayaran supplier:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn btn-secondary ${purchaseStatus === 'Lunas' ? 'btn-primary' : ''}`}
                  style={{ flex: 1, padding: '8px' }}
                  onClick={() => setPurchaseStatus('Lunas')}
                >
                  Lunas
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary ${purchaseStatus === 'Tempo' ? 'btn-danger' : ''}`}
                  style={{ flex: 1, padding: '8px' }}
                  onClick={() => setPurchaseStatus('Tempo')}
                >
                  Tempo
                </button>
              </div>
            </div>
            <div className="form-group" style={{ flex: '1 1 240px', marginBottom: 0, alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', minHeight: '42px' }}>
                {isSaving ? 'Menyimpan Pembelian...' : 'Simpan Pembelian & Terima Stok'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Riwayat Pembelian Barang */}
      <div className="panel-card no-print purchase-history" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <span className="panel-title">Riwayat Pembelian Barang</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {purchases.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Belum ada riwayat pembelian barang.</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Supplier</th>
                    <th>Detail Barang yang Dibeli</th>
                    <th>Total Nota</th>
                    <th>Status</th>
                    <th>Foto Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '0.85rem' }}>
                        {new Date(p.tanggal).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {p.nama_supplier}
                        {p.sumber_data === 'Simulasi otomatis (DEMO)' && (
                          <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.items?.map(i => `${i.nama_produk} (${i.jumlah} pcs)`).join(', ')}
                      </td>
                      <td style={{ fontWeight: '600' }}>{formatRupiah(p.total_nota)}</td>
                      <td>
                        <span className={`badge ${p.status === 'Lunas' ? 'badge-success' : 'badge-danger'}`}>
                          {p.status === 'Tempo' ? 'Tempo (Belum Lunas)' : 'Lunas'}
                        </span>
                      </td>
                      <td>
                        {p.foto_nota || p.foto_nota_base64 ? (
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}
                            onClick={() => setActivePreviewNotaImg(p.foto_nota || p.foto_nota_base64)}
                          >
                            <Eye size={12} /> Lihat Foto
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tidak ada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview Foto Nota */}
      {activePreviewNotaImg && (
        <div className="modal-overlay" onClick={() => setActivePreviewNotaImg(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span className="modal-title">Foto Nota Fisik</span>
              <button className="btn-icon-only btn-sm" onClick={() => setActivePreviewNotaImg(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: '#000', minHeight: '300px' }}>
              <img src={activePreviewNotaImg} alt="Nota Fisik" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActivePreviewNotaImg(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ----------------------------------------------------------------------------------
// SUB-VIEW: PENGELUARAN OPERASIONAL
// ----------------------------------------------------------------------------------
function ExpensesView({ expenses, formatRupiah, fetchData, showToast, showConfirm, requestWriteAccess }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    kategori: 'Transport',
    jumlah: '',
    keterangan: ''
  });
  const filteredExpenses = expenses.filter(expense => {
    const query = searchQuery.trim().toLocaleLowerCase('id-ID');
    if (!query) return true;
    const searchableValues = [
      expense.kategori,
      expense.keterangan,
      expense.tanggal,
      new Date(expense.tanggal).toLocaleString('id-ID'),
      expense.jumlah,
      formatRupiah(expense.jumlah)
    ];
    return searchableValues.some(value => String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanJumlah = parseNominal(formData.jumlah);
    if (cleanJumlah <= 0) {
      showToast('Jumlah pengeluaran harus lebih dari Rp 0!', 'error');
      return;
    }

    requestWriteAccess(async () => {
      try {
        await dbService.addExpense({
          ...formData,
          jumlah: cleanJumlah
        });
        setFormData({
          kategori: 'Transport',
          jumlah: '',
          keterangan: ''
        });
        showToast('Biaya operasional toko berhasil dicatat!', 'success');
        fetchData();
      } catch (err) {
        showToast('Gagal menyimpan biaya operasional.', 'error');
      }
    });
  };

  return (
    <div className="pos-layout">
      {/* List Riwayat Pengeluaran */}
      <div className="panel-card">
        <div className="panel-header">
          <span className="panel-title">Riwayat Pengeluaran Operasional</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="search"
                className="form-control"
                aria-label="Cari riwayat pengeluaran"
                placeholder="Cari kategori, keterangan, tanggal, atau nominal..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>
          {/* Fix #8: Ringkasan total pengeluaran per kategori */}
          {expenses.length > 0 && (
            <div style={{ padding: '12px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center', fontWeight: 'bold' }}>Total Bulan Ini:</span>
              {['Transport', 'Makan', 'Operasional', 'Listrik', 'Gaji', 'Lainnya'].map(kat => {
                const now = new Date();
                const total = expenses.filter(e => e.kategori === kat && new Date(e.tanggal).getMonth() === now.getMonth() && new Date(e.tanggal).getFullYear() === now.getFullYear()).reduce((s, e) => s + Number(e.jumlah), 0);
                if (total === 0) return null;
                return <span key={kat} className="badge badge-warning" style={{ fontSize: '0.75rem' }}>{kat}: {formatRupiah(total)}</span>;
              })}
              <span style={{ marginLeft: 'auto', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--color-danger)' }}>
                TOTAL: {formatRupiah(expenses.filter(e => { const n = new Date(); const d = new Date(e.tanggal); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).reduce((s, e) => s + Number(e.jumlah), 0))}
              </span>
            </div>
          )}
          {expenses.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Belum ada pencatatan biaya operasional.</p>
          ) : filteredExpenses.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>Tidak ada pengeluaran yang cocok dengan pencarian.</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Jumlah Biaya</th>
                    <th>Keterangan / Keperluan</th>
                    <th className="no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize: '0.85rem' }}>
                        {new Date(e.tanggal).toLocaleString('id-ID', { dateStyle: 'medium' })}
                      </td>
                      <td>
                        <span className="badge badge-warning">{e.kategori}</span>
                      </td>
                      <td style={{ fontWeight: '600', color: 'var(--color-danger)' }}>{formatRupiah(e.jumlah)}</td>
                      <td>
                        {e.keterangan || '-'}
                        {e.sumber_data === 'Simulasi otomatis (DEMO)' && (
                          <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>DEMO</span>
                        )}
                      </td>
                      {/* Fix #3: Tombol hapus pengeluaran */}
                      <td className="no-print">
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => requestWriteAccess(() => showConfirm(`Hapus pengeluaran ${e.kategori} sebesar ${formatRupiah(e.jumlah)}?`, async () => {
                            try {
                              await dbService.deleteExpense(e.id);
                              showToast('Pengeluaran berhasil dihapus.', 'success');
                              fetchData();
                            } catch (err) {
                              showToast('Gagal menghapus pengeluaran.', 'error');
                            }
                          }))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Form Tambah Pengeluaran */}
      <form onSubmit={handleSubmit} className="pos-cart no-print" style={{ height: 'auto', position: 'static' }}>
        <div className="panel-header" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <span className="panel-title">Catat Pengeluaran Baru</span>
        </div>
        <div className="panel-body">
          <div className="form-group">
            <label>Kategori Biaya:</label>
            <select 
              className="form-control"
              value={formData.kategori}
              onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
            >
              <option value="Transport">Bensin & Transportasi</option>
              <option value="Makan">Konsumsi / Makan Siang</option>
              <option value="Operasional">Kebersihan & Iuran Pasar</option>
              <option value="Listrik">Listrik & Air Toko</option>
              <option value="Gaji">Gaji Karyawan / Pembantu</option>
              <option value="Lainnya">Pengeluaran Lainnya</option>
            </select>
          </div>

          <div className="form-group">
            <label>Nominal Pengeluaran:</label>
            <div className="input-group">
              <span className="input-group-addon">Rp</span>
              <NominalInput
                required
                className="form-control" 
                value={formData.jumlah}
                onValueChange={(value) => setFormData({ ...formData, jumlah: value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Keterangan Tambahan:</label>
            <textarea 
              className="form-control" 
              rows="3"
              placeholder="misal: Beli solar untuk motor kulakan ke glodok"
              value={formData.keterangan}
              onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
            Simpan Pengeluaran
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
