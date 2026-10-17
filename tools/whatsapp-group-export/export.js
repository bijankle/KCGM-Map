// Runs inside WhatsApp Web. Adds a floating button that exports the open group's members to CSV.
(() => {
  const BTN_ID = 'wa-group-export-btn';

  const req = name => { try { return window.require ? window.require(name) : null; } catch (e) { return null; } };
  const isYou = s => /^you$/i.test(s.trim());
  const isPhone = s => /^\+?[\d\s\-(). ]{7,}$/.test(s) && s.replace(/\D/g, '').length >= 7;
  const normPhone = s => '+' + s.replace(/\D/g, '');
  const clean = s => (s || '').replace(/[‎‏‪-‮⁦-⁩ ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Preferred: read WhatsApp's own data. Gives real numbers, including for saved contacts.
  function fromStore() {
    const C = req('WAWebCollections');
    if (!C || !C.Chat || !C.Contact) return null;
    const chat = C.Chat.getModelsArray().find(c => c.active);
    if (!chat) throw new Error('Open a group chat first.');
    if (chat.id.server !== 'g.us') throw new Error('The open chat is not a group.');
    const meta = chat.groupMetadata || (C.GroupMetadata && C.GroupMetadata.get(chat.id));
    if (!meta || !meta.participants) return null;
    const parts = meta.participants.getModelsArray ? meta.participants.getModelsArray() : [];
    if (!parts.length) return null;
    const apiContact = req('WAWebApiContact');

    const rows = parts.map(p => {
      const id = p.id;
      const c = C.Contact.get(id);
      let phone = '';
      if (id.server === 'c.us') phone = '+' + id.user;
      else {
        // Newer groups hide numbers behind a "lid". Try to map it back to a phone number.
        let pn = c && c.phoneNumber;
        if (!pn && apiContact && apiContact.getPhoneNumber) { try { pn = apiContact.getPhoneNumber(id); } catch (e) {} }
        if (pn && pn.user) phone = '+' + pn.user;
      }
      return {
        Name: clean(c && (c.name || c.verifiedName)),
        'WhatsApp name': clean(c && c.pushname),
        Phone: phone,
        Role: p.isSuperAdmin ? 'Owner' : p.isAdmin ? 'Admin' : 'Member',
        'Saved in my contacts': c && c.isMyContact ? 'Yes' : 'No'
      };
    });
    return { group: clean(chat.formattedTitle || chat.name), rows, method: 'full' };
  }

  // Fallback: read the member line under the group name in the chat header.
  function fromDom() {
    const header = document.querySelector('#main header');
    if (!header) throw new Error('Open a group chat first.');
    const titles = [...header.querySelectorAll('span[title]')].map(s => s.getAttribute('title'));
    const group = clean(titles[0] || 'whatsapp-group');
    const list = titles.find(t => t && t.includes(','));
    if (!list) throw new Error('Could not read the member list. Wait until the names show under the group name, then click again.');
    const rows = list.split(',').map(clean).filter(s => s && !isYou(s)).map(s => ({
      Name: isPhone(s) ? '' : s.replace(/^~\s*/, ''),
      'WhatsApp name': '',
      Phone: isPhone(s) ? normPhone(s) : '',
      Role: '',
      'Saved in my contacts': isPhone(s) ? 'No' : 'Yes'
    }));
    return { group, rows, method: 'basic' };
  }

  function toCsv(rows) {
    const head = Object.keys(rows[0]);
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return '﻿' + [head.map(esc).join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\r\n');
  }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function exportGroup() {
    try {
      let result = null;
      try { result = fromStore(); } catch (e) { if (/Open a group|not a group/.test(e.message)) throw e; }
      if (!result) result = fromDom();
      result.rows.sort((a, b) => (a.Name || a['WhatsApp name'] || '~' + a.Phone).localeCompare(b.Name || b['WhatsApp name'] || '~' + b.Phone));
      const file = (result.group || 'whatsapp-group').replace(/[\\/:*?"<>|]/g, '') + ' contacts.csv';
      download(file, toCsv(result.rows));
      const missing = result.rows.filter(r => !r.Phone).length;
      flash(`Exported ${result.rows.length} contacts` + (missing ? `, ${missing} without a number` : ''));
    } catch (e) {
      flash(e.message, true);
    }
  }

  function flash(msg, bad) {
    const b = document.getElementById(BTN_ID);
    if (!b) return;
    b.textContent = msg;
    b.style.background = bad ? '#c0392b' : '#128c4a';
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.textContent = 'Export group CSV'; b.style.background = '#25d366'; }, 4000);
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const b = document.createElement('button');
    b.id = BTN_ID;
    b.textContent = 'Export group CSV';
    Object.assign(b.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: 99999,
      background: '#25d366', color: '#08140d', border: 'none', borderRadius: '20px',
      padding: '10px 18px', font: '600 14px system-ui, sans-serif', cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)'
    });
    b.onclick = exportGroup;
    document.body.appendChild(b);
  }

  addButton();
  setInterval(addButton, 3000);
})();
