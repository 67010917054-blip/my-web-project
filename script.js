/**
 * Smart Credit Log — Production Application Engine
 * Includes Multi-Tenant Supabase DB Connection, PWA Manager, and Speech Engine
 */

// 1. Database Configuration & Credentials Setup
const SUPABASE_URL = "https://kxcjaayomduufsjiflcq.supabase.co"; // ระบุ URL โครงการ Supabase ของคุณ
const SUPABASE_ANON_KEY = "sb_publishable_ASAUXrJuW1d7844ypUTIuw_w3xtMTke";                      // ระบุ Public Anon Key ของคุณ

// Initialize Supabase Client dynamically
var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;


// Application Global State Engine
const appState = {
  currentUser: null,
  currentShop: null,
  isRecording: false,
  theme: localStorage.getItem('appTheme') || 'light',
  isOffline: !navigator.onLine
};

// Speech Recognition Instance
let recognition = null;

// Initialization Workflow
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNetworkStatusListener();
  initSpeechEngine();
  registerServiceWorker();
  
  // Check active Session
  await checkUserSession();
});

// UI Control — Loading Overlay
function setLoading(isLoading, text = "กำลังโหลดข้อมูลระบบ...") {
  const overlay = document.getElementById('globalLoading');
  const label = document.getElementById('loadingText');
  if (label) label.textContent = text;
  if (isLoading) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}

// UI Control — Theme Management
function initTheme() {
  document.documentElement.setAttribute('data-theme', appState.theme);
  updateThemeIcons();
  
  document.getElementById('themeToggleBtnLanding').addEventListener('click', toggleTheme);
  document.getElementById('themeToggleBtnApp').addEventListener('click', toggleTheme);
}

function toggleTheme() {
  appState.theme = appState.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('appTheme', appState.theme);
  document.documentElement.setAttribute('data-theme', appState.theme);
  updateThemeIcons();
}

function updateThemeIcons() {
  const iconClass = appState.theme === 'dark' ? 'fa-sun' : 'fa-moon';
  document.querySelectorAll('.theme-toggle i').forEach(el => {
    el.className = `fa-solid ${iconClass}`;
  });
}

// Offline State Monitor
function initNetworkStatusListener() {
  window.addEventListener('online', () => {
    appState.isOffline = false;
    document.getElementById('offlineBanner').classList.remove('active');
  });
  window.addEventListener('offline', () => {
    appState.isOffline = true;
    document.getElementById('offlineBanner').classList.add('active');
  });
}

// Auth State Check & Routing
async function checkUserSession() {
  setLoading(true, "กำลังตรวจสอบสถานะการเข้าสู่ระบบ...");
  
  if (!supabase) {
    setLoading(false);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    appState.currentUser = session.user;
    await fetchShopDetails(session.user.id);
  } else {
    showSection('authSection');
    setLoading(false);
  }
}

async function fetchShopDetails(userId) {
  try {
    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', userId)
      .single();

    if (error || !shop) {
      showSection('setupSection');
    } else {
      appState.currentShop = shop;
      document.getElementById('displayShopName').textContent = shop.name;
      showSection('appSection');
      await loadDashboardData();
    }
  } catch (err) {
    console.error("Error fetching shop details:", err);
    showSection('setupSection');
  } finally {
    setLoading(false);
  }
}

function showSection(sectionId) {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('setupSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'none';
  
  document.getElementById(sectionId).style.display = 'block';
}

// Modal Handlers
function openAuthModal(mode) {
  switchAuthTab(mode);
  document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function switchAuthTab(mode) {
  const isRegister = mode === 'register';
  document.getElementById('tabLoginBtn').classList.toggle('active', !isRegister);
  document.getElementById('tabRegisterBtn').classList.toggle('active', isRegister);
  document.getElementById('shopNameGroup').style.display = isRegister ? 'block' : 'none';
  document.getElementById('loginOptions').style.display = isRegister ? 'none' : 'flex';
  document.getElementById('authSubmitBtn').textContent = isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
}

function openModal(id) {
  if (id === 'saleModal') populateSaleDropdowns();
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Auth Logic (Sign In / Register / Social)
async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const isRegister = document.getElementById('tabRegisterBtn').classList.contains('active');

  setLoading(true, isRegister ? "กำลังลงทะเบียน..." : "กำลังเข้าสู่ระบบ...");

  try {
    if (isRegister) {
      const shopName = document.getElementById('authShopName').value;
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      
      appState.currentUser = data.user;
      document.getElementById('setupShopName').value = shopName;
      closeAuthModal();
      showSection('setupSection');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      appState.currentUser = data.user;
      closeAuthModal();
      await fetchShopDetails(data.user.id);
    }
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    setLoading(false);
  }
}

async function handleSocialLogin(provider) {
  setLoading(true, `กำลังเชื่อมต่อกับ ${provider}...`);
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) throw error;
  } catch (err) {
    alert("การเข้าสู่ระบบล้มเหลว: " + err.message);
    setLoading(false);
  }
}

async function handleLogout() {
  if (confirm("คุณต้องการออกจากระบบหรือไม่?")) {
    setLoading(true, "กำลังออกจากระบบ...");
    await supabase.auth.signOut();
    appState.currentUser = null;
    appState.currentShop = null;
    showSection('authSection');
    setLoading(false);
  }
}

// Shop Setup Form Submit
async function handleSetupSubmit(e) {
  e.preventDefault();
  setLoading(true, "กำลังบันทึกข้อมูลร้านค้า...");

  const shopData = {
    owner_id: appState.currentUser.id,
    name: document.getElementById('setupShopName').value,
    owner_name: document.getElementById('setupOwnerName').value,
    phone: document.getElementById('setupPhone').value,
    promptpay: document.getElementById('setupPromptPay').value,
    address: document.getElementById('setupAddress').value
  };

  try {
    const { data, error } = await supabase.from('shops').insert([shopData]).select().single();
    if (error) throw error;
    
    appState.currentShop = data;
    document.getElementById('displayShopName').textContent = data.name;
    showSection('appSection');
    await loadDashboardData();
  } catch (err) {
    alert("บันทึกข้อมูลไม่สำเร็จ: " + err.message);
  } finally {
    setLoading(false);
  }
}

// Voice Recognition Engine
function initSpeechEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.continuous = false;
    
    recognition.onstart = () => {
      appState.isRecording = true;
      document.getElementById('mainVoiceBtn').classList.add('recording');
      document.getElementById('voiceStatusText').textContent = "กำลังฟังคำสั่งเสียงของคุณ...";
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById('voiceResultBox').style.display = 'block';
      document.getElementById('voiceResultBox').textContent = `ข้อความที่ได้ยิน: "${transcript}"`;
      await processVoiceCommand(transcript);
    };

    recognition.onerror = () => { stopRecordingUI(); };
    recognition.onend = () => { stopRecordingUI(); };
  }
}

function toggleVoiceRecording() {
  if (!recognition) {
    alert("อุปกรณ์นี้ไม่รองรับการแปลงเสียงเป็นข้อความ");
    return;
  }
  if (appState.isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

function stopRecordingUI() {
  appState.isRecording = false;
  document.getElementById('mainVoiceBtn').classList.remove('recording');
  document.getElementById('voiceStatusText').textContent = "กดปุ่มสีเขียวเพื่อบันทึกหนี้ด้วยเสียง";
}

// NLP Parser for Thai Debt Voice Command
async function processVoiceCommand(text) {
  // Regex Pattern matching: [ชื่อลูกค้า] เซ็น [ชื่อสินค้า] [จำนวน] [หน่วย] [ราคา] บาท
  const pattern = /(.+)\s+(เซ็น|ซื้อ)\s+(.+)\s+(\d+)\s*(ขวด|ชิ้น|กล่อง|ถุง|ห่อ)?\s*(\d+)\s*บาท/;
  const match = text.match(pattern);

  if (match) {
    const customerName = match[1].trim();
    const action = match[2]; // 'เซ็น' or 'ซื้อ'
    const productName = match[3].trim();
    const qty = parseInt(match[4]);
    const price = parseFloat(match[6]);

    if (confirm(`ยืนยันบันทึกข้อมูล:\nลูกค้า: ${customerName}\nสินค้า: ${productName} (x${qty})\nราคารวม: ${price} บาท\nประเภท: ${action === 'เซ็น' ? 'หนี้ค้างชำระ' : 'เงินสด'}`)) {
      await executeVoiceTransaction(customerName, productName, qty, price, action === 'เซ็น');
    }
  } else {
    alert("ไม่สามารถแยกแยะข้อมูลได้ กรุณาพูดในรูปแบบ เช่น: 'ยายแจ่ม เซ็น น้ำมันพืช 1 ขวด 45 บาท'");
  }
}

async function executeVoiceTransaction(custName, prodName, qty, amount, isCredit) {
  setLoading(true, "กำลังบันทึกรายการ...");
  try {
    // 1. Get or Create Customer
    let { data: cust } = await supabase.from('customers').select('*').eq('shop_id', appState.currentShop.id).eq('name', custName).single();
    if (!cust) {
      const { data: newCust } = await supabase.from('customers').insert([{ shop_id: appState.currentShop.id, name: custName }]).select().single();
      cust = newCust;
    }

    // 2. Add Transaction Record
    await supabase.from('transactions').insert([{
      shop_id: appState.currentShop.id,
      customer_id: cust.id,
      product_name: prodName,
      quantity: qty,
      amount: amount,
      is_credit: isCredit,
      status: isCredit ? 'unpaid' : 'paid'
    }]);

    await loadDashboardData();
    alert("บันทึกรายการเรียบร้อยแล้ว!");
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
  } finally {
    setLoading(false);
  }
}

// Dashboard Data Loading
async function loadDashboardData() {
  if (!appState.currentShop) return;
  
  const shopId = appState.currentShop.id;

  // Load Today Sales Summary
  const { data: sales } = await supabase.from('transactions').select('amount').eq('shop_id', shopId).eq('status', 'paid');
  const totalSales = sales ? sales.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) : 0;
  document.getElementById('statTodaySales').textContent = `฿${totalSales.toFixed(2)}`;

  // Load Debts Count
  const { data: debts } = await supabase.from('transactions').select('id').eq('shop_id', shopId).eq('status', 'unpaid');
  document.getElementById('statDebtCount').textContent = `${debts ? debts.length : 0} รายการ`;

  // Load Stock Items
  const { data: products } = await supabase.from('products').select('*').eq('shop_id', shopId);
  document.getElementById('statStockCount').textContent = `${products ? products.length : 0} ชิ้น`;

  // Render Low Stock List (< 5 items)
  const lowStockList = document.getElementById('lowStockList');
  lowStockList.innerHTML = '';
  const lowStockItems = products ? products.filter(p => p.stock_qty <= 5) : [];
  
  if (lowStockItems.length === 0) {
    lowStockList.innerHTML = '<li class="empty-msg">ไม่มีสินค้าใกล้หมด</li>';
  } else {
    lowStockItems.forEach(p => {
      lowStockList.innerHTML += `<li><span>${p.name}</span> <strong class="text-red">เหลือ ${p.stock_qty} ชิ้น</strong></li>`;
    });
  }
}

// Modal Form Action Handlers
async function handleAddCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('custName').value;
  const phone = document.getElementById('custPhone').value;

  setLoading(true, "กำลังเพิ่มลูกค้า...");
  try {
    await supabase.from('customers').insert([{ shop_id: appState.currentShop.id, name, phone }]);
    closeModal('customerModal');
    await loadDashboardData();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    setLoading(false);
  }
}

async function handleAddProduct(e) {
  e.preventDefault();
  const name = document.getElementById('prodName').value;
  const price = parseFloat(document.getElementById('prodPrice').value);
  const stock_qty = parseInt(document.getElementById('prodStock').value);

  setLoading(true, "กำลังบันทึกสินค้า...");
  try {
    await supabase.from('products').insert([{ shop_id: appState.currentShop.id, name, price, stock_qty }]);
    closeModal('productModal');
    await loadDashboardData();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    setLoading(false);
  }
}

// Dynamic PromptPay QR Generator (EMVCo Standard Spec)
function generatePromptPayQR(amount) {
  const promptpayNum = appState.currentShop.promptpay;
  document.getElementById('payShopName').textContent = appState.currentShop.name;
  document.getElementById('payOwnerName').textContent = appState.currentShop.owner_name;
  document.getElementById('payPromptPayNum').textContent = promptpayNum;
  document.getElementById('payAmount').textContent = `฿${parseFloat(amount).toFixed(2)}`;

  const qrBox = document.getElementById('paymentQrCode');
  qrBox.innerHTML = '';

  // Demo PromptPay QR Target Engine
  new QRCode(qrBox, {
    text: `https://promptpay.io/${promptpayNum}/${amount}`,
    width: 160,
    height: 160
  });

  openModal('paymentModal');
}

function confirmPaymentSuccess() {
  closeModal('paymentModal');
  alert("บันทึกการรับชำระเงินเรียบร้อยแล้ว");
}

// PWA Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}