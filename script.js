// ============ CONFIG ============
const engines = {
    google: { name: 'Google', url: 'https://www.google.com/search?q=', icon: 'https://www.google.com/favicon.ico' },
    baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=', icon: 'https://www.baidu.com/favicon.ico' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'https://www.bing.com/favicon.ico' },
    github: { name: 'GitHub', url: 'https://github.com/search?q=', icon: 'https://github.com/favicon.ico' }
};

const defaultBg = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
const MAX_TAGS = 15;

let currentEngine = 'google';
let desktopTags = [];
let contextTagUrl = null;

// ============ DOM ELEMENTS ============
const $ = id => document.getElementById(id);
const clock = $('clock');
const dateEl = $('date');
const engineBtn = $('engineBtn');
const engineIcon = $('engineIcon');
const engineDropdown = $('engineDropdown');
const searchInput = $('searchInput');
const searchBtn = $('searchBtn');
const bgUpload = $('bgUpload');
const resetBgBtn = $('resetBgBtn');
const bookmarksBtn = $('bookmarksBtn');
const sidebar = $('bookmarksSidebar');
const sidebarOverlay = $('sidebarOverlay');
const closeSidebarBtn = $('closeSidebarBtn');
const bookmarkList = $('bookmarkList');
const tagsGrid = $('tagsGrid');
const contextMenu = $('contextMenu');
const deleteTagBtn = $('deleteTagBtn');
const prevPageBtn = $('prevPageBtn');
const nextPageBtn = $('nextPageBtn');

// ============ CLOCK ============
function updateClock() {
    const now = new Date();
    clock.textContent = now.toTimeString().slice(0, 5);
    dateEl.textContent = now.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });
}
updateClock();
setInterval(updateClock, 1000);

// ============ SEARCH ENGINE ============
function setEngine(key) {
    currentEngine = key;
    engineIcon.src = engines[key].icon;
    localStorage.setItem('engine', key);
    engineDropdown.classList.remove('show');
}

engineBtn.onclick = e => {
    e.stopPropagation();
    engineDropdown.classList.toggle('show');
};

document.querySelectorAll('.engine-option').forEach(btn => {
    btn.onclick = () => setEngine(btn.dataset.engine);
});

document.onclick = () => engineDropdown.classList.remove('show');

setEngine(localStorage.getItem('engine') || 'google');

// ============ SEARCH ============
function doSearch() {
    const q = searchInput.value.trim();
    if (q) location.href = engines[currentEngine].url + encodeURIComponent(q);
}

searchBtn.onclick = doSearch;
searchInput.onkeypress = e => e.key === 'Enter' && doSearch();

// ============ BACKGROUND ============
const DB_NAME = 'YZBNewTabDB';
const DB_VERSION = 1;
const STORE_NAME = 'backgrounds';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
    });
}

function saveBackgroundToDB(file) {
    return initDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(file, 'customBg');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function getBackgroundFromDB() {
    return initDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get('customBg');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    });
}

function deleteBackgroundFromDB() {
    return initDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete('customBg');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
}

function setBg(value) {
    if (value instanceof Blob) {
        const url = URL.createObjectURL(value);
        document.body.style.background = `url('${url}') center/cover fixed`;
    } else if (value.startsWith('http') || value.startsWith('data:')) {
        document.body.style.background = `url('${value}') center/cover fixed`;
    } else {
        document.body.style.background = value;
    }
}

function loadBg() {
    getBackgroundFromDB().then(blob => {
        if (blob) {
            setBg(blob);
        } else if (chrome?.storage) {
            // Fallback/Migration: Check local storage just in case or for transition
            chrome.storage.local.get(['customBg'], r => {
                if (r.customBg) setBg(r.customBg);
            });
        }
    }).catch(console.error);
}

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 3840; // 4K Resolution

                if (width > MAX_SIZE || height > MAX_SIZE) {
                    if (width > height) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    } else {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // High quality compression
                canvas.toBlob(blob => {
                    resolve(blob);
                }, 'image/webp', 0.95);
            };
        };
    });
}

bgUpload.onchange = async e => {
    const file = e.target.files[0];
    if (file) {
        // Show original immediately to feel responsive
        setBg(file);

        try {
            // Compress in background
            const compressedBlob = await compressImage(file);
            // Save optimized version to DB
            await saveBackgroundToDB(compressedBlob);
            // Clean up legacy storage
            chrome?.storage?.local.remove('customBg');
        } catch (err) {
            console.error('Image processing failed:', err);
            // Fallback to original if compression fails
            saveBackgroundToDB(file).catch(console.error);
        }
    }
};

resetBgBtn.onclick = () => {
    setBg(defaultBg);
    deleteBackgroundFromDB().catch(console.error);
    chrome?.storage?.local.remove('customBg');
};

loadBg();

// ============ SIDEBAR ============
function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
    loadBookmarks();
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
}

bookmarksBtn.onclick = openSidebar;
closeSidebarBtn.onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;

function loadBookmarks() {
    if (!chrome?.bookmarks) {
        bookmarkList.innerHTML = '<p class="placeholder-text" style="color: #888;">书签功能仅在扩展中可用</p>';
        return;
    }

    bookmarkList.innerHTML = '';

    // 1. Get Recent Bookmarks
    chrome.bookmarks.getRecent(10, recentItems => {
        if (recentItems && recentItems.length > 0) {
            const recentFolder = {
                title: '最近添加',
                children: recentItems
            };
            renderNode(recentFolder, bookmarkList);

            // Add separator
            const separator = document.createElement('div');
            separator.style.borderBottom = '1px solid rgba(255,255,255,0.15)';
            separator.style.margin = '10px 12px';
            bookmarkList.appendChild(separator);
        }

        // 2. Get Full Tree
        chrome.bookmarks.getTree(tree => {
            tree[0].children?.forEach(node => renderNode(node, bookmarkList));
        });
    });
}

function renderNode(node, container) {
    if (node.url) {
        const div = document.createElement('div');
        div.className = 'bookmark-item';
        const isAdded = desktopTags.some(t => t.url === node.url);
        const host = new URL(node.url).hostname;

        div.innerHTML = `
      <a class="bookmark-link" href="${node.url}" target="_blank">
        <img src="https://www.google.com/s2/favicons?domain=${host}&sz=32" alt="">
        <span>${node.title || node.url}</span>
      </a>
      ${isAdded
                ? '<span class="added-badge">✓ 已添加</span>'
                : `<button class="add-btn" data-url="${node.url}" data-title="${node.title || ''}" data-host="${host}">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none"><path d="M12 5v14M5 12h14"/></svg>
           </button>`
            }
    `;

        const addBtn = div.querySelector('.add-btn');
        addBtn?.addEventListener('click', e => {
            e.stopPropagation();
            const tag = {
                url: addBtn.dataset.url,
                title: addBtn.dataset.title,
                icon: `https://www.google.com/s2/favicons?domain=${addBtn.dataset.host}&sz=128`
            };
            if (addTag(tag)) {
                addBtn.outerHTML = '<span class="added-badge">✓ 已添加</span>';
            }
        });

        container.appendChild(div);
    } else if (node.children) {
        const folder = document.createElement('div');
        const header = document.createElement('div');
        header.className = 'folder-header';
        header.innerHTML = `
      <svg viewBox="0 0 24 24" stroke-width="2" fill="none"><path d="m9 18 6-6-6-6"/></svg>
      <svg viewBox="0 0 24 24" stroke-width="2" fill="none">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
      </svg>
      <span>${node.title || '文件夹'}</span>
    `;

        const content = document.createElement('div');
        content.className = 'folder-content';

        header.onclick = () => {
            const open = content.style.display !== 'block';
            content.style.display = open ? 'block' : 'none';
            header.querySelector('svg').style.transform = open ? 'rotate(90deg)' : '';
        };

        node.children.forEach(c => renderNode(c, content));
        folder.appendChild(header);
        folder.appendChild(content);
        container.appendChild(folder);
    }
}

// ============ DESKTOP TAGS ============
const PAGE_SIZE = 21; // 7 columns x 3 rows
let currentPage = 0;
let dragSrcEl = null;
let isInitialRender = true; // Track if this is the first render

function addTag(tag) {
    if (desktopTags.some(t => t.url === tag.url)) return false;
    // Limit removed: if (desktopTags.length >= MAX_TAGS) ...
    desktopTags.push(tag);
    saveTags();

    // Jump to the last page where the new tag is added
    const totalPages = Math.ceil(desktopTags.length / PAGE_SIZE);
    currentPage = totalPages - 1;

    renderTags();
    return true;
}

function removeTag(url) {
    desktopTags = desktopTags.filter(t => t.url !== url);
    saveTags();

    // Adjust page if current page becomes empty
    const totalPages = Math.ceil(desktopTags.length / PAGE_SIZE) || 1;
    if (currentPage >= totalPages) currentPage = totalPages - 1;

    renderTags();
    if (sidebar.classList.contains('open')) loadBookmarks();
}

function saveTags() {
    chrome?.storage?.local.set({ desktopTags });
}

function loadTags() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['desktopTags'], r => {
            if (r.desktopTags) {
                desktopTags = r.desktopTags;
            } else {
                // Try localStorage fallback if chrome storage is empty (migration/dev)
                const local = localStorage.getItem('desktopTags');
                if (local) {
                    try { desktopTags = JSON.parse(local); } catch (e) { }
                }
            }
            renderTags();
        });
    } else {
        // Fallback for non-extension environment
        const local = localStorage.getItem('desktopTags');
        if (local) {
            try { desktopTags = JSON.parse(local); } catch (e) { }
        }
        renderTags();
    }
}

function renderTags() {
    tagsGrid.innerHTML = '';
    // Render Dots
    // Dots removed per user request

    const totalPages = Math.ceil(desktopTags.length / PAGE_SIZE) || 1;

    // Update Buttons Logic (Always run this, regardless of totalPages)
    prevPageBtn.classList.remove('hidden');
    nextPageBtn.classList.remove('hidden');

    if (currentPage > 0) {
        prevPageBtn.classList.remove('disabled');
        prevPageBtn.onclick = () => {
            currentPage--;
            renderTags();
        };
    } else {
        prevPageBtn.classList.add('disabled');
        prevPageBtn.onclick = null;
    }

    if (currentPage < totalPages - 1) {
        nextPageBtn.classList.remove('disabled');
        nextPageBtn.onclick = () => {
            currentPage++;
            renderTags();
        };
    } else {
        nextPageBtn.classList.add('disabled');
        nextPageBtn.onclick = null;
    }

    // Slice tags for current page
    const start = currentPage * PAGE_SIZE;
    const pageTags = desktopTags.slice(start, start + PAGE_SIZE);

    pageTags.forEach((tag, i) => {
        const a = document.createElement('a');
        a.href = tag.url;
        a.className = isInitialRender ? 'tag-item animate-in' : 'tag-item';
        a.draggable = true; // Enable drag
        a.dataset.index = start + i; // Store global index
        if (isInitialRender) {
            a.style.animationDelay = `${i * 0.05}s`;
        }

        // Use higher resolution favicon (128px) for better quality on rounded icons
        const iconUrl = tag.icon.includes('s2/favicons')
            ? tag.icon.replace(/sz=\d+/, 'sz=128')
            : tag.icon;

        a.innerHTML = `
      <img class="tag-icon" src="${iconUrl}" alt="" draggable="false" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23667eea%22><rect rx=%224%22 width=%2224%22 height=%2224%22/><text x=%2212%22 y=%2216%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2212%22>${tag.title.charAt(0).toUpperCase()}</text></svg>'">
      <span class="tag-title">${truncate(tag.title, 10)}</span>
    `;

        // Context Menu
        a.oncontextmenu = e => {
            e.preventDefault();
            showContextMenu(e, tag.url);
        };

        // Click handling (prevent navigation when dragging)
        a.onclick = e => {
            if (a.classList.contains('dragging')) {
                e.preventDefault();
            }
        };

        // Drag Events
        addDragHandlers(a);

        tagsGrid.appendChild(a);
    });

    // After first render, disable initial animation
    if (isInitialRender) {
        isInitialRender = false;
    }
}

function addDragHandlers(el) {
    let isDragging = false;
    let startX, startY;
    let initialX, initialY;
    let dragClone = null;
    let currentDropTarget = null;

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        if (e.button && e.button !== 0) return;

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = el.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        isDragging = false;

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', endDrag);
    }

    function onDrag(e) {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        // Start dragging after threshold
        if (!isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
            isDragging = true;
            dragSrcEl = el;
            el.classList.add('dragging');

            // Create drag clone
            dragClone = el.cloneNode(true);
            dragClone.classList.remove('dragging');
            dragClone.classList.add('drag-clone');
            dragClone.style.cssText = `
                position: fixed;
                width: ${el.offsetWidth}px;
                height: ${el.offsetHeight}px;
                left: ${initialX}px;
                top: ${initialY}px;
                z-index: 1000;
                pointer-events: none;
                transform: scale(1.05);
                opacity: 1;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
                box-shadow: 0 15px 35px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(dragClone);
        }

        if (isDragging && dragClone) {
            // Move clone with cursor
            dragClone.style.left = (initialX + deltaX) + 'px';
            dragClone.style.top = (initialY + deltaY) + 'px';

            // Find element under cursor
            dragClone.style.visibility = 'hidden';
            const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            dragClone.style.visibility = 'visible';

            const targetItem = elementBelow?.closest('.tag-item');

            // Update hover states
            if (currentDropTarget && currentDropTarget !== targetItem) {
                currentDropTarget.classList.remove('drag-over');
            }

            if (targetItem && targetItem !== el && !targetItem.classList.contains('dragging')) {
                targetItem.classList.add('drag-over');
                currentDropTarget = targetItem;
            } else {
                currentDropTarget = null;
            }
        }
    }

    function endDrag(e) {
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', endDrag);

        if (isDragging) {
            const srcIndex = parseInt(el.dataset.index);
            const targetIndex = currentDropTarget ? parseInt(currentDropTarget.dataset.index) : srcIndex;

            // If dropped on a valid target, perform the swap
            if (currentDropTarget && srcIndex !== targetIndex) {
                // Reorder data array
                const movedItem = desktopTags.splice(srcIndex, 1)[0];
                desktopTags.splice(targetIndex, 0, movedItem);
                saveTags();

                // Animate and re-render
                performSwapAnimation(el, currentDropTarget, dragClone, () => {
                    renderTags();
                });
            } else {
                // Return clone to original position
                if (dragClone) {
                    dragClone.style.transition = 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    dragClone.style.left = initialX + 'px';
                    dragClone.style.top = initialY + 'px';
                    dragClone.style.transform = 'scale(1)';
                    dragClone.style.boxShadow = 'none';

                    setTimeout(() => {
                        dragClone?.remove();
                        dragClone = null;
                        el.classList.remove('dragging');
                    }, 250);
                } else {
                    el.classList.remove('dragging');
                }
            }

            // Clean up
            document.querySelectorAll('.tag-item').forEach(item => {
                item.classList.remove('drag-over');
            });

            isDragging = false;
            dragSrcEl = null;
            currentDropTarget = null;
        }
    }

    el.addEventListener('dragstart', e => e.preventDefault());
}

// Perform swap animation then callback
function performSwapAnimation(srcEl, targetEl, dragClone, callback) {
    const targetRect = targetEl.getBoundingClientRect();

    // Animate clone to target position
    if (dragClone) {
        dragClone.style.transition = 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
        dragClone.style.left = targetRect.left + 'px';
        dragClone.style.top = targetRect.top + 'px';
        dragClone.style.transform = 'scale(1)';
        dragClone.style.boxShadow = 'none';
    }

    // Clean up after animation
    setTimeout(() => {
        dragClone?.remove();
        srcEl.classList.remove('dragging');
        callback();
    }, 250);
}

// Animate tag deletion with iOS-style effect
function animateTagDeletion(url) {
    const items = Array.from(tagsGrid.querySelectorAll('.tag-item'));
    const targetItem = items.find(item => item.getAttribute('href') === url);

    if (targetItem) {
        // Get positions before removal
        const rects = items.map(item => item.getBoundingClientRect());

        // Animate the deleted item
        targetItem.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 1, 1)';
        targetItem.style.transform = 'scale(0)';
        targetItem.style.opacity = '0';

        setTimeout(() => {
            // Remove from data
            desktopTags = desktopTags.filter(t => t.url !== url);
            saveTags();

            // Adjust page if needed
            const totalPages = Math.ceil(desktopTags.length / PAGE_SIZE) || 1;
            if (currentPage >= totalPages) currentPage = totalPages - 1;

            // Remove element and animate others
            targetItem.remove();

            // Animate remaining items to fill gap
            const remainingItems = Array.from(tagsGrid.querySelectorAll('.tag-item'));
            const start = currentPage * PAGE_SIZE;

            remainingItems.forEach((item, i) => {
                const oldIndex = items.findIndex(old => old.getAttribute('href') === item.getAttribute('href'));
                if (oldIndex !== -1) {
                    const oldRect = rects[oldIndex];
                    const newRect = item.getBoundingClientRect();
                    const deltaX = oldRect.left - newRect.left;
                    const deltaY = oldRect.top - newRect.top;

                    if (deltaX !== 0 || deltaY !== 0) {
                        item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                        item.style.transition = 'none';

                        requestAnimationFrame(() => {
                            item.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
                            item.style.transform = 'translate(0, 0)';
                        });
                    }
                }

                item.dataset.index = start + i;
            });

            // Update sidebar if open
            if (sidebar.classList.contains('open')) loadBookmarks();

            // Full re-render only if we need to load items from next page
            const expectedCount = desktopTags.slice(start, start + PAGE_SIZE).length;
            if (remainingItems.length === 0 && expectedCount > 0) {
                // Page is empty but there are items to show - re-render
                setTimeout(() => renderTags(), 350);
            }
        }, 300);
    } else {
        // Fallback to normal removal
        removeTagDirect(url);
    }
}

function removeTagDirect(url) {
    desktopTags = desktopTags.filter(t => t.url !== url);
    saveTags();
    const totalPages = Math.ceil(desktopTags.length / PAGE_SIZE) || 1;
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    renderTags();
    if (sidebar.classList.contains('open')) loadBookmarks();
}

function truncate(str, len) {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ============ CONTEXT MENU ============
function showContextMenu(e, url) {
    contextTagUrl = url;
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.classList.add('show');
}

function hideContextMenu() {
    contextMenu.classList.remove('show');
    contextTagUrl = null;
}

deleteTagBtn.onclick = () => {
    if (contextTagUrl) {
        animateTagDeletion(contextTagUrl);
        hideContextMenu();
    }
};

document.addEventListener('click', hideContextMenu);

// ============ INIT ============
loadTags();
