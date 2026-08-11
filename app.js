if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

let db;
const dbReq = indexedDB.open('WarehouseDB', 1);

dbReq.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains('inventory')) {
    db.createObjectStore('inventory', { keyPath: 'barcode' });
  }
};

dbReq.onsuccess = (e) => {
  db = e.target.result;
  renderTable(''); 
};

dbReq.onerror = (e) => console.error("خطای IndexedDB:", e.target.error);

const statusBadge = document.getElementById('status-badge');
function updateOnlineStatus() {
  if (navigator.onLine) {
    statusBadge.textContent = 'آنلاین';
    statusBadge.className = 'badge online';
  } else {
    statusBadge.textContent = 'آفلاین';
    statusBadge.className = 'badge offline';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

let html5QrcodeScanner = null;

document.getElementById('btn-start-scan').addEventListener('click', () => {
  html5QrcodeScanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 150 } };

  html5QrcodeScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      document.getElementById('barcode-input').value = decodedText;
      fetchProductDetails(decodedText);
      stopScanner();
    },
    () => {}
  ).then(() => {
    document.getElementById('btn-start-scan').disabled = true;
    document.getElementById('btn-stop-scan').disabled = false;
  }).catch(err => alert("خطا در دسترسی به دوربین: " + err));
});

function stopScanner() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      document.getElementById('btn-start-scan').disabled = false;
      document.getElementById('btn-stop-scan').disabled = true;
    });
  }
}

document.getElementById('btn-stop-scan').addEventListener('click', stopScanner);

function fetchProductDetails(barcode) {
  const tx = db.transaction('inventory', 'readonly');
  const store = tx.objectStore('inventory');
  const req = store.get(barcode);

  req.onsuccess = () => {
    if (req.result) {
      document.getElementById('title-input').value = req.result.title;
      document.getElementById('qty-input').value = req.result.qty;
    } else {
      document.getElementById('title-input').value = '';
      document.getElementById('qty-input').value = '1';
    }
  };
}

document.getElementById('inventory-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const barcode = document.getElementById('barcode-input').value.trim();
  const title = document.getElementById('title-input').value.trim();
  const qty = parseInt(document.getElementById('qty-input').value, 10);

  if (!barcode || !title) return;

  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');
  const checkReq = store.get(barcode);

  checkReq.onsuccess = () => {
    const existingItem = checkReq.result;

    if (existingItem && existingItem.title.toLowerCase() !== title.toLowerCase()) {
      alert(`⚠️ خطا: این بارکد قبلاً برای کالای "${existingItem.title}" ثبت شده است!\nنمی‌توانید آن را برای "${title}" ثبت کنید.`);
      return;
    }

    store.put({ barcode, title, qty, updatedAt: new Date().toISOString() });
  };

  tx.oncomplete = () => {
    alert('کالا با موفقیت ذخیره شد.');
    document.getElementById('inventory-form').reset();
    renderTable('');
  };
});

document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  renderTable(query);
});

function renderTable(searchQuery = '') {
  const tbody = document.querySelector('#inventory-table tbody');
  tbody.innerHTML = '';

  if (!db) return;

  const tx = db.transaction('inventory', 'readonly');
  const store = tx.objectStore('inventory');
  const req = store.openCursor();

  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      
      const matchesBarcode = item.barcode.toLowerCase().includes(searchQuery);
      const matchesTitle = item.title.toLowerCase().includes(searchQuery);

      if (matchesBarcode || matchesTitle) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.barcode}</td>
          <td>${item.title}</td>
          <td>
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
              <button type="button" class="secondary" style="padding: 2px 8px; font-weight: bold;" onclick="changeQty('${item.barcode}', -1)">-</button>
              <strong style="min-width: 24px; text-align: center;">${item.qty}</strong>
              <button type="button" class="success" style="padding: 2px 8px; font-weight: bold;" onclick="changeQty('${item.barcode}', 1)">+</button>
            </div>
          </td>
          <td>
            <button type="button" class="danger" onclick="deleteItem('${item.barcode}')">حذف</button>
          </td>
        `;
        tbody.appendChild(tr);
      }
      
      cursor.continue();
    }
  };
}

window.changeQty = function(barcode, amount) {
  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');
  const req = store.get(barcode);

  req.onsuccess = () => {
    const item = req.result;
    if (item) {
      item.qty += amount;
      if (item.qty < 0) item.qty = 0; 
      item.updatedAt = new Date().toISOString();
      store.put(item);
    }
  };

  tx.oncomplete = () => {
    const currentQuery = document.getElementById('search-input').value.trim().toLowerCase();
    renderTable(currentQuery);
  };
};

window.deleteItem = function(barcode) {
  if (confirm('آیا از حذف این کالا اطمینان دارید؟')) {
    const tx = db.transaction('inventory', 'readwrite');
    const store = tx.objectStore('inventory');
    store.delete(barcode);
    tx.oncomplete = () => {
      const currentQuery = document.getElementById('search-input').value.trim().toLowerCase();
      renderTable(currentQuery);
    };
  }
};
