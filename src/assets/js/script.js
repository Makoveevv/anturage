import Swiper from 'swiper';
import {FreeMode, Navigation} from 'swiper/modules';


window.addEventListener('DOMContentLoaded', () => {

  // Не дёргать тяжёлые пересчёты layout на каждый тик resize (resize стреляет десятки раз в секунду)
  function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // Подсветка "сейчас работаем/не работаем" — график берётся из data-атрибутов
  // блока .header__worktime, а не зашит в код. Это позволит позже отдавать
  // другие значения из WordPress (через шаблон/настройки), не трогая JS.
  (function updateWorktimeStatus() {
    const wrapper = document.querySelector('.header__worktime');
    const worknowEl = document.querySelector('.header__worktime-worknow');
    if (!wrapper || !worknowEl) return;

    const [dayFrom, dayTo] = (wrapper.dataset.workDays || '1-5').split('-').map(Number);
    const hourFrom = Number(wrapper.dataset.workFrom ?? 9);
    const hourTo = Number(wrapper.dataset.workTo ?? 18);

    const now = new Date();
    const day = now.getDay(); // 0 = вс, 6 = сб
    const hour = now.getHours();
    const isWorkingNow = day >= dayFrom && day <= dayTo && hour >= hourFrom && hour < hourTo;

    worknowEl.textContent = isWorkingNow ? 'сейчас работаем' : 'сейчас не работаем';
    worknowEl.classList.toggle('header__worktime-worknow--closed', !isWorkingNow);
  })();

  if (window.innerWidth < 768) {
    document.querySelector('.main').style.marginTop = document.querySelector('.header__inner-sm').offsetHeight + 15 + 'px';
    document.querySelector('.navbar').style.paddingTop = document.querySelector('.header__inner-sm').offsetHeight + 25 + 'px';
    if (document.querySelector('.product__modal')) {
      document.querySelector('.product__modal').style.top = document.querySelector('.header__inner-sm').offsetHeight + 'px';
    }

    window.addEventListener('resize', debounce(() => {
      document.querySelector('.main').style.marginTop = document.querySelector('.header__inner-sm').offsetHeight + 15 + 'px';
    }));
  }

  // Старый IE-полифилл защиты от ПКМ удалён: он был сломан (битые имена событий:
  // 'moimportdown' вместо 'mousedown') и срабатывал только в IE, который мы больше не
  // поддерживаем. Полноценную защиту картинок сделаем отдельной задачей при наполнении галереи.

  function getScrollbarWidth() {
    // Создаем временный элемент с прокруткой
    const scrollDiv = document.createElement("div");
    scrollDiv.style.visibility = "hidden";
    scrollDiv.style.overflow = "scroll";
    scrollDiv.style.position = "absolute";
    scrollDiv.style.top = "-9999px";
    scrollDiv.style.width = "100px";
    document.body.appendChild(scrollDiv);

    const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
    document.body.removeChild(scrollDiv);
    return scrollbarWidth;
  }

  function lockScroll() {
    const scrollbarWidth = getScrollbarWidth();
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  function unlockScroll() {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }

  // Экранирование значений из Google Sheets перед вставкой в HTML
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Флаг отправки: блокирует закрытие модалки во время запроса
  let isSubmitting = false;

  // Показ/скрытие блокирующего лоадера на форме заказа
  function setModalLoading(isLoading) {
    isSubmitting = isLoading;
    const wrapper = document.querySelector('.submit-modal__wrapper.show');
    if (!wrapper) return;
    wrapper.querySelector('.submit-modal__loader')?.classList.toggle('show', isLoading);
    wrapper.querySelectorAll('input, button').forEach(el => el.disabled = isLoading);
  }

  // Закрыть саму форму заказа (а не модалку благодарности/ошибки — у них общий базовый класс)
  function closeOrderFormModal() {
    document.querySelector('.submit-modal__wrapper:not(.thanks-modal__wrapper):not(.error-modal__wrapper)')?.classList.remove('show');
  }

  // Закрыть форму заказа и показать модалку благодарности
  function showThanksModal() {
    closeOrderFormModal();
    document.querySelector('.thanks-modal__wrapper')?.classList.add('show');
    lockScroll();
  }

  // Закрыть форму заказа и показать модалку с ошибкой отправки
  function showErrorModal(message) {
    closeOrderFormModal();
    const wrapper = document.querySelector('.error-modal__wrapper');
    const text = wrapper?.querySelector('.error-modal__text');
    if (text) text.textContent = message || 'Произошла ошибка при отправке заявки. Попробуйте ещё раз или позвоните нам напрямую.';
    wrapper?.classList.add('show');
    lockScroll();
  }

  // Закрыть модалку ошибки и вернуть пользователя в форму заказа, чтобы попробовать снова
  function reopenOrderFormModal() {
    document.querySelector('.error-modal__wrapper')?.classList.remove('show');
    document.querySelector('.submit-modal__wrapper:not(.thanks-modal__wrapper):not(.error-modal__wrapper)')?.classList.add('show');
  }


  // Menu

  function setHeaderBottomMenuItemsWidth() { 
    if (window.innerWidth > 992) {
      let summWidth = 0;
      document.querySelectorAll('.header__menu-bottom-link').forEach(item => {
        summWidth += item.offsetWidth;
      });
      
      let indentSumm = document.querySelector('.header__menu-top-list').clientWidth - summWidth;
      
      document.querySelectorAll('.header__menu-bottom-link').forEach((item, i, arr) => {
        item.style.width = (item.offsetWidth + indentSumm/arr.length) + 'px';
      });
    } else {
      return false;
    }
  }

  setHeaderBottomMenuItemsWidth();

  window.addEventListener('resize', debounce(setHeaderBottomMenuItemsWidth));

  // Navbar
  
  document.querySelector('.burger').addEventListener('click', function(e) {
    e.preventDefault();
    if (!document.querySelector('.burger').classList.contains('active')) {
      this.classList.add('active');
      document.querySelector('.navbar').classList.add('show');
      document.querySelector('.layer').classList.add('show');
      document.querySelector('.header__inner-sm').classList.add('shadow');
      lockScroll();
    } else {
      document.querySelector('.burger').classList.remove('active');
      document.querySelector('.navbar').classList.remove('show');
      document.querySelector('.layer').classList.remove('show');
      document.querySelector('.header__inner-sm').classList.remove('shadow');
      document.querySelector('.product__wrapper').classList.remove('show');
      unlockScroll();
    }
      
    });


    document.querySelectorAll('.calc').forEach(calc => {
      
    // Calc Tabs
    const tabsButtons = calc.querySelectorAll('.tabs__button');

    tabsButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        tabsButtons.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        const item = document.getElementById(e.target.getAttribute('data-tab'));
        calc.querySelectorAll('.tabs__item').forEach(item => item.classList.remove('active'));
        item.classList.add('active');
      });
    });

    const controls = calc.querySelectorAll(".calc__painting .calc__size-input");

    controls.forEach(control => {
      if (control.querySelector(".calc__inc-btn") || control.querySelector(".calc__dec-btn")) {
        const select = control.querySelector("select");
        const incBtn = control.querySelector(".calc__inc-btn");
        const decBtn = control.querySelector(".calc__dec-btn");

        incBtn.addEventListener("click", () => {
          const options = Array.from(select.options);
          const currentIndex = options.findIndex(opt => opt.selected);

          if (currentIndex < options.length - 1) {
            options[currentIndex].selected = false;
            options[currentIndex + 1].selected = true;
            select.dispatchEvent(new Event("change")); // если нужно отследить изменение
          }
        });

        decBtn.addEventListener("click", () => {
          const options = Array.from(select.options);
          const currentIndex = options.findIndex(opt => opt.selected);

          if (currentIndex > 0) {
            options[currentIndex].selected = false;
            options[currentIndex - 1].selected = true;
            select.dispatchEvent(new Event("change")); // если нужно отследить изменение
          }
        });
      }
    });
  });

  // Calc frames
  document.querySelectorAll('.calc__frames-checkbox').forEach(framesCheckbox => {
    const framesCheckboxBox = framesCheckbox.querySelector('.calc__frames-box');
    const checkboxInput = framesCheckbox.querySelector('input[type="checkbox"]');
    const framesTypes = framesCheckbox.querySelector('.calc__frames-types');
    const chooseBtn = framesCheckbox.querySelector('.calc__frames-choose');
    const cancelBtn = framesCheckbox.querySelector('.calc__frames-cancel');

    // Клик по основной "раме"
    framesCheckboxBox.addEventListener('click', function () {
      checkboxInput.checked = true;

      // Если чекбокс включен — показываем выбор рам
      if (checkboxInput.checked) {
        framesTypes.classList.add('show');
      }
    });

    // Кнопка "Выбрать"
    chooseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const radioChecked = framesCheckbox.querySelector('input[name="frameType"]:checked');
      if (radioChecked) {
        framesTypes.classList.remove('show');
      }
    });

    // Кнопка "Отмена"
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const radioChecked = framesCheckbox.querySelector('input[name="frameType"]:checked');
      if (radioChecked) {
        radioChecked.checked = false;
      }
      framesTypes.classList.remove('show');
      checkboxInput.checked = false;
    });
  });


  // Calc Nums
  document.querySelectorAll('.calc__wallpaper').forEach(wallpapers => {

    const calcSizeBtns = wallpapers.querySelectorAll('.calc__num-btn');
    calcSizeBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        const numInput = btn.parentNode.querySelector('input');
        if (this.classList.contains('calc__inc-btn')) {
          numInput.stepUp();
        } else {
          numInput.stepDown();
        }
      });
    });

  });

  document.querySelectorAll(".calc__size-input > input").forEach(function( currentInput, index, arr ) {
    currentInput.addEventListener('input', e => {
      if (e.target.value > 999) {
        e.target.value = e.target.value.slice(0, -1)
      }
    })
  });


  
  document.querySelectorAll('.calc').forEach(calc => {
  // ======== Картины ========
  const calcPainting = calc.querySelector('.calc__painting');
  if (calcPainting) {
    function calcPaintingsDisableFeature() {
      if (calcPainting.querySelector('.calc__frames-input[name="holder"][value="Оргалит"]').checked) {
        calcPainting.querySelectorAll('input[name="stretch"]').forEach(input => {
          input.nextElementSibling.classList.add('disabled');
          input.disabled = true;
          input.checked = false;
        });
        calcPainting.querySelector('input[name="material"][value="Хлопок"]').nextElementSibling.classList.add('disabled');
        calcPainting.querySelector('input[name="material"][value="Хлопок"]').disabled = true;
        if (calcPainting.querySelector('input[name="material"][value="Хлопок"]').checked) {
          calcPainting.querySelector('input[name="material"]').checked = true;
        }
      } else {
        calcPainting.querySelectorAll('input[name="stretch"]').forEach(input => {
          input.nextElementSibling.classList.remove('disabled');
          input.disabled = false;
        });
        calcPainting.querySelectorAll('input[name="stretch"]')[0].checked = true;
        calcPainting.querySelector('input[name="material"][value="Хлопок"]').nextElementSibling.classList.remove('disabled');
        calcPainting.querySelector('input[name="material"][value="Хлопок"]').disabled = false;
      }
    }

    calcPaintingsDisableFeature();

    calc.querySelectorAll('.calc__frames-box').forEach(box => {
      box.addEventListener('click', () => {
        calcPaintingsDisableFeature();
      });
    });
  }

  // ======== Обои ========
  const calcWallpaper = calc.querySelector('.calc__wallpaper');
  if (calcWallpaper) {
    function calcWallpapersDisableFeature() {
      if (!calcWallpaper.querySelector('input[name="rollType"][value="обои"]:checked')) {
        calcWallpaper.querySelectorAll('.calc__wallpaper-type input').forEach(input => {
          input.disabled = true;
          input.checked = false;
        });
        calcWallpaper.querySelectorAll('.calc__wallpaper-type label').forEach(label => {
          label.classList.add('disabled');
        });
        calcWallpaper.querySelectorAll('.calc__texture select').forEach(select => {
          select.disabled = true;
          select.classList.add('disabled');
        });
      } else {
        calcWallpaper.querySelectorAll('.calc__wallpaper-type input').forEach(input => {
          input.disabled = false;
        });
        calcWallpaper.querySelectorAll('.calc__wallpaper-type input')[0].checked = true;
        calcWallpaper.querySelectorAll('.calc__wallpaper-type label').forEach(label => {
          label.classList.remove('disabled');
        });
        calcWallpaper.querySelectorAll('.calc__texture select').forEach(select => {
          select.disabled = false;
          select.classList.remove('disabled');
        });
      }
    }

    calcWallpapersDisableFeature();

    calcWallpaper.querySelectorAll('.calc__roll-type .calc__radio').forEach(radio => {
      radio.addEventListener('click', e => {
        calcWallpapersDisableFeature();

        if (e.target.getAttribute('value') == 'бумага') {
          calcWallpaper.querySelector('.calc__roll-type .calc__checkbox').classList.add('disabled');
          calcWallpaper.querySelector('.calc__roll-type input[name="lamination"]').disabled = true;
          calcWallpaper.querySelector('.calc__roll-type input[name="lamination"]').checked = false;
        } else {
          calcWallpaper.querySelector('.calc__roll-type .calc__checkbox').classList.remove('disabled');
          calcWallpaper.querySelector('.calc__roll-type input[name="lamination"]').disabled = false;
        }
      });
    });
  }
});

  if (document.querySelector('.calc')) {
    // Google Sheets
    const spreadsheetId = "1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY";
    const apiKey = "AIzaSyCFJMCfcE0B1ZaUs0DatbPAaZz_Wp3W8ZU";

    // Диапазоны (названия счистов)
    const ranges = [
      "Багеты",
      "В рулоне",
      "Дополнительно",
      "Текстуры",
      "Картины(JS)",
      "Популярные размеры"
    ];

    // Функция для преобразования строки в число (если возможно)
    function toNum(value) {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }

    const CALC_CACHE_KEY = "calcSheets_cache";
    async function getSheetsData() {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.join("&ranges=")}&key=${apiKey}`;
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
        if (!data.valueRanges) throw new Error('Пустой ответ Google Sheets');
        localStorage.setItem(CALC_CACHE_KEY, JSON.stringify(data));
      } catch (err) {
        console.error('Калькулятор: ошибка загрузки цен, пробую кэш', err);
        const cached = localStorage.getItem(CALC_CACHE_KEY);
        if (!cached) return null;
        data = JSON.parse(cached);
      }

      // ---------- 1. Багеты ----------
      const baguettes = (() => {
        const [header, ...rows] = data.valueRanges[0].values;
        return rows.map(row => {
          let obj = {};
          header.forEach((col, i) => {
            obj[col] = toNum(row[i] || "");
          });
          return obj;
        });
      })();

      // ---------- 2. В рулоне ----------
      const rolls = (() => {
        const [header, ...rows] = data.valueRanges[1].values;
        return rows.map(row => {
          let obj = {};
          header.forEach((col, i) => {
            obj[col] = toNum(row[i] || "");
          });
          return obj;
        });
      })();

      // ---------- 3. Дополнительно ----------
      const additional = (() => {
        const [header, ...rows] = data.valueRanges[2].values;
        return rows.map(row => {
          let obj = {};
          header.forEach((col, i) => {
            obj[col] = toNum(row[i] || "");
          });
          return obj;
        });
      })();

      // ---------- 4. Текстуры ----------
      const textures = (() => {
        const [header, ...rows] = data.valueRanges[3].values;
        return {
          [header[0]]: rows.map(r => r[0]).filter(Boolean),
          [header[1]]: rows.map(r => r[1]).filter(Boolean)
        };
      })();

      // ---------- 5. Картины(JS) ----------
      const paintings = (() => {
        const [header, ...rows] = data.valueRanges[4].values;
        return rows.map(row => ({
          length: toNum(row[0]),
          height: toNum(row[1]),
          material: row[2] || "",
          holder: row[3] || "",
          price: toNum(row[4])
        }));
      })();

      // ---------- 6. Популярные размеры ----------
      const popularSizes = (() => {
        const [header, ...rows] = data.valueRanges[5].values;
        return rows.map(row => ({
          length: toNum(row[0]),
          height: toNum(row[1])
        }));
      })();
      
      

      // Возвращаем всё объектом
      return { baguettes, rolls, additional, textures, paintings, popularSizes };
    }


  (async () => {
    const sheets = await getSheetsData();
    if (!sheets) return; // ни сети, ни кэша — калькулятор не инициализируем, но страница не падает
    const { baguettes, rolls, additional, textures, paintings, popularSizes } = sheets;


    if (document.querySelector('.submit-modal .calc')) {
      const modalCalc = document.querySelector('.submit-modal .calc');
      const widthSelect = modalCalc.querySelector(".calc__size-select--width");
      const heightSelect = modalCalc.querySelector(".calc__size-select--height");
      const mainImg = document.querySelector(".product__picture-img img");

      function getAllowedLengths(originalWidth, originalHeight, lengths, minSize = 30, maxSize = 200) {
        const ratio = originalHeight / originalWidth;

        // Считаем диапазон
        const validLengths = lengths.filter(length => {
          const height = length * ratio;
          return height >= minSize && height <= maxSize;
        });

        return validLengths;
      }
      
      const allLengths = paintings.map(p => +p.length);
      const allLengthsUnique = [...new Set(allLengths)].sort((a, b) => a - b);
      
      const allowed = getAllowedLengths(mainImg.naturalWidth, mainImg.naturalHeight, allLengthsUnique);

      widthSelect.innerHTML = ""; // очищаем перед добавлением

      allowed.forEach(l => {
        const option = document.createElement("option");
        option.value = l;
        option.textContent = l;
        widthSelect.appendChild(option);
      });

      function setPerfectPaintingHeight() {
        const aspectRatio = mainImg.naturalHeight / mainImg.naturalWidth;
        const idealHeight = Math.round(+widthSelect.value * aspectRatio);
        
        const availableHeights = paintings
          .filter(p => p.length === +widthSelect.value)
          .map(p => p.height)

        const availableHeightsNew = paintings.filter(p => p.height === +widthSelect.value).map(p => p.length);
        
        availableHeightsNew.forEach(item => {
          availableHeights.push(item);
        });

        const uniqueAvailableHeights = [...new Set(availableHeights)].sort((a, b) => a - b);

        let closest = uniqueAvailableHeights[0];
        let minDiff = Math.abs(closest - idealHeight);

        for (let h of uniqueAvailableHeights) {
          const diff = Math.abs(h - idealHeight);
          if (diff < minDiff) {
            closest = h;
            minDiff = diff;
          }
        }
        
        heightSelect.value = closest;
      }

      setPerfectPaintingHeight();

      widthSelect.addEventListener('change', () => {
        setPerfectPaintingHeight();
      });
    }


    document.querySelectorAll('.calc').forEach(calc => {

      const baguettesList = calc.querySelector('.calc__frames-list');
      baguettesList.innerHTML = baguettes.map(baguette => `<label class="calc__frames-type">
                                      <img loading="lazy" width="60" height="60" src="assets/img/${baguette.name}.jpeg" alt="${baguette.name}">
                                      <input class="calc__frames-input" type="radio" name="frameType" value="${baguette.name}">
                                      <div class="calc__frames-title">${baguette.name}</div>
                                    </label>`).join('');

      // переменные для calcPaintingPriceCounting
      let paintingWidth = +calc.querySelector('.calc__size-select--width').value;
      calc.querySelector('.calc__size-select--width').addEventListener('change', e => {
        paintingWidth = +calc.querySelector('.calc__size-select--width').value;
      });

      let paintingHeight = +calc.querySelector('.calc__size-select--height').value;
      calc.querySelector('.calc__size-select--height').addEventListener('change', e => {
        paintingHeight = +calc.querySelector('.calc__size-select--height').value;
      });

      let paintingHolder = calc.querySelector('input[name="holder"]:checked').value;
      calc.querySelectorAll('input[name="holder"]').forEach(radio => {
        radio.addEventListener('click', () => {
          paintingHolder = calc.querySelector('input[name="holder"]:checked').value;
        });
      });
      
      let paintingMaterial = calc.querySelector('input[name="material"]:checked').value;
      calc.querySelectorAll('input[name="material"]').forEach(radio => {
        radio.addEventListener('click', () => {
          paintingMaterial = calc.querySelector('input[name="material"]:checked').value;
        });
      });

      let paintingFrame = false;
      calc.querySelectorAll('input[name="frameType"]').forEach(radio => {
        radio.addEventListener('click', e => {
            paintingFrame = radio.value;
        });
      });
      calc.querySelector('.calc__frames-cancel').addEventListener('click', () => {
        paintingFrame = false;
      });
      const paintingSumm = calc.querySelector('.calc__count-summ--painting');

      

      function calcPaintingPriceCounting() {
        paintings.forEach(obj => {
          if (((obj.length == paintingWidth && obj.height == paintingHeight) || (obj.length == paintingHeight && obj.height == paintingWidth)) && obj.holder == paintingHolder && obj.material == paintingMaterial) {
            let summary = obj.price;
            if (paintingFrame) {
              baguettes.forEach(baguette => {
                if (baguette.name == paintingFrame) {
                  let baguettePrice = (((paintingWidth + paintingHeight)*2 + (baguette.width * .8)) / 100) * baguette.price;
                  summary += baguettePrice;
                  summary = Math.round(summary);
                }
              });
            }
            paintingSumm.textContent = summary + 'р.';
          }
        });
      }

      calcPaintingPriceCounting();

      // переменные для calcWallpaperPriceCounting
      const wallpaperTab = calc.querySelector('.calc__wallpaper');


      let RollType = wallpaperTab.querySelector('input[name="rollType"]:checked').value;
      wallpaperTab.querySelectorAll('input[name="rollType"]').forEach(radio => {
        radio.addEventListener('click', () => {
          RollType = wallpaperTab.querySelector('input[name="rollType"]:checked').value;
        });
      });

      let wallpaperType = wallpaperTab.querySelector('input[name="wallpaperType"]:checked').value;
      wallpaperTab.querySelectorAll('input[name="wallpaperType"]').forEach(radio => {
        radio.addEventListener('click', () => {
          wallpaperType = wallpaperTab.querySelector('input[name="wallpaperType"]:checked').value;
        });
      });

      const texture = wallpaperTab.querySelector('select[name="texture"]');

      const wallpaperSumm = calc.querySelector('.calc__count-summ--wallpaper');
      

      function calcWallpaperPriceCounting() {
        let wallpaperWidth = +wallpaperTab.querySelector('input[name="rollLength"]').value;
        wallpaperTab.querySelector('input[name="rollLength"]').addEventListener('change', e => {
          wallpaperWidth = +wallpaperTab.querySelector('input[name="rollLength"]').value;
        });

        let wallpaperHeight = +wallpaperTab.querySelector('input[name="rollHeight"]').value;
        wallpaperTab.querySelector('input[name="rollHeight"]').addEventListener('change', e => {
          wallpaperHeight = +wallpaperTab.querySelector('input[name="rollHeight"]').value;
        });

        let square = wallpaperWidth * wallpaperHeight; //в сантиметрах
        let summary = 0;


        rolls.forEach(obj => {
          if (obj.type == RollType && (obj.subtype == '-' || obj.subtype == wallpaperType)) {
            summary = square / 10000 * +obj.price;
          }
        });


        if (wallpaperTab.querySelector('input[name="lamination"]').checked) {
          additional.forEach(obj => {
            summary += +obj.price * square / 10000;
          });
        }
        
        summary = Math.round(summary);
        
        if ((RollType == 'обои' && square >= 20000) || RollType !== 'обои') {
          wallpaperTab.querySelector('.calc__extra-note').style.cssText = 'color: #1C496C';
          wallpaperSumm.textContent = summary + 'р.';
        } else {
          wallpaperTab.querySelector('.calc__extra-note').style.cssText = 'color: #ff0000ff';
        }
      }


      function setWallpaperTextures() {
        const list = wallpaperType == "премиум" ? textures.premium : textures.standart;
        texture.innerHTML = '<option value="нет">Нет</option>' +
          list.map(t => `<option value="${t.toLowerCase()}">${t}</option>`).join('');
      }

      setWallpaperTextures();

      wallpaperTab.querySelectorAll('input[name="wallpaperType"]').forEach(input => {
        input.addEventListener('click', setWallpaperTextures);
      });

      calcWallpaperPriceCounting();


      calc.querySelectorAll('.calc__count-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          calcPaintingPriceCounting();
          calcWallpaperPriceCounting();
        });
      });

    });

  })();
  }

  // === ПРОВЕРКА НАЛИЧИЯ ТАБЛИЦ ===
  if (document.getElementById('paintings-table') || document.getElementById('wallpapers-table')) {

    // === НАСТРОЙКИ ===
    const spreadsheetId = "1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY";
    const apiKey = "AIzaSyCFJMCfcE0B1ZaUs0DatbPAaZz_Wp3W8ZU";
    const ranges = ["Картины(JS)", "Популярные размеры", "В рулоне"];

    const CACHE_KEY = "priceTables_cache";
    const CACHE_TIME_KEY = "priceTables_cache_time";
    const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

    // === УТИЛИТЫ ===
    function toNum(value) {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }

    // === ЗАГРУЗКА ДАННЫХ ===
    async function fetchPriceData() {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.join("&ranges=")}&key=${apiKey}`;
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
        if (!data.valueRanges) throw new Error('Пустой ответ Google Sheets');
      } catch (err) {
        console.error('Таблица цен: ошибка загрузки, отдаю кэш (даже просроченный)', err);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) return JSON.parse(cached);
        throw err;
      }

      // 1. Картины
      const [paintHeader, ...paintRows] = data.valueRanges[0].values || [];
      const paintings = paintRows.map(row => ({
        length: toNum(row[0]),
        height: toNum(row[1]),
        material: row[2] || "",
        holder: row[3] || "",
        price: toNum(row[4])
      }));

      // 2. Популярные размеры
      const [sizeHeader, ...sizeRows] = data.valueRanges[1].values || [];
      const popularSizes = sizeRows.map(row => ({
        length: toNum(row[0]),
        height: toNum(row[1])
      }));

      // 3. Рулонные
      const [rollHeader, ...rollRows] = data.valueRanges[2].values || [];
      const rolls = rollRows.map(row => ({
        type: row[0] || "",
        subtype: row[1] || "-",
        price: toNum(row[2])
      }));

      return { paintings, popularSizes, rolls };
    }

    // === КЭШИРОВАНИЕ ===
    function saveToCache(data) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    }

    function loadFromCache() {
      const cached = localStorage.getItem(CACHE_KEY);
      const time = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && time && (Date.now() - parseInt(time)) < CACHE_DURATION) {
        return JSON.parse(cached);
      }
      return null;
    }

    // === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
    let paintings = [], popularSizes = [], rolls = [];

    // === ПОСТРОЕНИЕ ТАБЛИЦЫ КАРТИН ===
    function buildPopularPaintings() {
      return popularSizes.map(size => {
        const { length, height } = size;
        const candidates = paintings.filter(p => p.length === length && p.height === height);

        return {
          length, height,
          priceCottonFrame: candidates.find(c => c.material === "Хлопок" && c.holder === "Подрамник")?.price || '-',
          pricePolyFrame: candidates.find(c => c.material === "Полиэстер" && c.holder === "Подрамник")?.price || '-',
          pricePolyBoard: candidates.find(c => c.material === "Полиэстер" && c.holder === "Оргалит")?.price || '-',
          pricePaperBoard: candidates.find(c => c.material === "Бумага" && c.holder === "Оргалит")?.price || '-',
        };
      });
    }

    function renderPaintingsTable() {
      const table = document.getElementById('paintings-table');
      if (!table) return;

      const finalArray = buildPopularPaintings();
      table.innerHTML = finalArray.map(size => `<tr>
          <th>${size.length}х${size.height}</th>
          <td>${size.priceCottonFrame} руб</td>
          <td>${size.pricePolyFrame} руб</td>
          <td>${size.pricePolyBoard} руб</td>
          <td>${size.pricePaperBoard} руб</td>
        </tr>`).join('');
    }

    // === ПОСТРОЕНИЕ РУЛОННЫХ ===
    function transformRollsArray(arr) {
      const result = [];
      arr.forEach(item => {
        const existing = result.find(r => r.type === item.type);
        if (existing) {
          if (typeof existing.subtype === "object") {
            existing.subtype[item.subtype] = item.price;
          } else {
            const prevSubtype = existing.subtype;
            const prevPrice = existing.price;
            existing.subtype = { [prevSubtype]: prevPrice };
            delete existing.price;
            existing.subtype[item.subtype] = item.price;
          }
        } else {
          if (item.subtype === "-") {
            result.push({ ...item });
          } else {
            result.push({ type: item.type, subtype: { [item.subtype]: item.price } });
          }
        }
      });
      return result;
    }

    function renderWallpapersTable() {
      const table = document.getElementById('wallpapers-table');
      if (!table) return;

      const rollsTransformed = transformRollsArray(rolls);
      table.innerHTML = rollsTransformed.map(roll => {
        if (roll.subtype === '-') {
          return `<tr>
            <td colspan='2'>${roll.type}</td>
            <td>${roll.price} руб</td>
          </tr>`;
        }
        return Object.entries(roll.subtype).map(([subtype, price], i) =>
          `<tr>` +
            (i === 0 ? `<td rowspan="${Object.keys(roll.subtype).length}">${roll.type}</td>` : '') +
            `<td>${subtype}</td>
              <td>${price} руб</td>
            </tr>`).join('');
      }).join('');
    }

    // === ОСНОВНАЯ ЛОГИКА ===
    async function loadPriceTables() {
      let data = loadFromCache();

      if (!data) {
        try {
          data = await fetchPriceData();
          saveToCache(data);
        } catch (err) {
          console.error('Таблица цен: нет ни сети, ни кэша — таблицы не строим', err);
          return;
        }
      }

      // Распаковка
      paintings = data.paintings;
      popularSizes = data.popularSizes;
      rolls = data.rolls;

      // Рендер
      renderPaintingsTable();
      renderWallpapersTable();

      // Автообновление каждые 10 сек (проверка кэша)
      setInterval(checkCacheAndRefresh, 10000);
    }

    async function checkCacheAndRefresh() {
      const time = localStorage.getItem(CACHE_TIME_KEY);
      if (!time || (Date.now() - parseInt(time)) >= CACHE_DURATION) {
        try {
          const newData = await fetchPriceData();
          saveToCache(newData);

          paintings = newData.paintings;
          popularSizes = newData.popularSizes;
          rolls = newData.rolls;

          renderPaintingsTable();
          renderWallpapersTable();
        } catch (err) {
          console.error('Таблица цен: обновление не удалось, оставляю текущие данные', err);
        }
      }
    }

    // === ЗАПУСК ===
    loadPriceTables();
  }

  // Swiper
  const swiper = new Swiper('.top-100__slider', {
  modules: [Navigation],
  loop: true,
  slidesPerView: 1,
  spaceBetween: 20,

  breakpoints: {
    450: { slidesPerView: 2 },
    576: { slidesPerView: 3 },
    768: { slidesPerView: 2 },
    930: { slidesPerView: 3 }
  },

  navigation: {
    nextEl: '.top-100__slider-button-next',
    prevEl: '.top-100__slider-button-prev',
  }
});

  // Examples
    const examplesSlider = new Swiper('.examples__slider', {
    modules: [Navigation, FreeMode],
    loop: false,
    slidesPerView: 1,
    spaceBetween: 15,
    freeMode: true,

    breakpoints: {
      450: { slidesPerView: 2 },
      576: { slidesPerView: 3 },
      768: { slidesPerView: 2 },
      930: { slidesPerView: 3 }
    },

    navigation: {
      nextEl: '.examples__slider-button-next',
      prevEl: '.examples__slider-button-prev',
    }
  });
  

  // Pictures
  if (document.querySelector('.filters')) {
    document.querySelector('.pictures__sort-button').addEventListener('click', () => {
      document.querySelector('.filters').classList.add('show');
      document.querySelector('.layer').classList.add('show');
      lockScroll();
    });

    document.querySelector('.filters__close').addEventListener('click', () => {
      document.querySelector('.filters').classList.remove('show');
      document.querySelector('.layer').classList.remove('show');
      unlockScroll();
    });

    document.querySelectorAll('.dropdown__name').forEach(item => {
      item.addEventListener('click', function() {
        this.classList.toggle('active');
        this.nextElementSibling.classList.toggle('show');
      })
    });
  };
   
  if (document.querySelector('.layer')) {
    document.querySelector('.layer').addEventListener('click', e => {
      document.querySelector('.filters')?.classList.remove('show');
      document.querySelector('.product__wrapper')?.classList.remove('show');
      document.querySelector('.burger')?.classList.remove('active');
      document.querySelector('.navbar')?.classList.remove('show');
      document.querySelector('.header__inner-sm')?.classList.remove('shadow');
      document.querySelector('.layer').classList.remove('show');
      unlockScroll();
    });
  }

  if (document.querySelector('.filters__dropdown-list') && document.querySelector('.filters__dropdown-list').innerHTML == '') {
    document.querySelector(".pictures__sort-button").style.cssText = 'display: none';
  }

  if (document.querySelectorAll('.pictures__item')) {
    document.querySelectorAll('.pictures__item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        document.querySelector('.product__wrapper').classList.add('show');
        lockScroll();
        document.querySelector('.burger').classList.add('active');
      });
    });
  }

  if (document.querySelector('.product__close')) {
    document.querySelector('.product__close').addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('.product__wrapper').classList.remove('show');
      unlockScroll();
    });
  }

  if (document.querySelector('.product__wrapper')) {
    document.querySelector('.product__wrapper').addEventListener('click', e => {
      if (e.target.classList.contains('product__wrapper')) {
        document.querySelector('.product__wrapper').classList.remove('show');
        unlockScroll();
      }
    });
  }

  if (document.querySelector('.product__submit-btn')) {
    document.querySelector('.product__submit-btn').addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('.submit-modal__wrapper').classList.add('show');
    });

    document.querySelector('.submit-modal__close').addEventListener('click', e => {
      e.preventDefault();
      if (isSubmitting) return;
      document.querySelector('.submit-modal__wrapper').classList.remove('show');
    });

    document.querySelector('.submit-modal__wrapper').addEventListener('click', e => {
      if (isSubmitting) return;
      if (e.target.classList.contains('submit-modal__wrapper')) document.querySelector('.submit-modal__wrapper').classList.remove('show');
    });
  }

  // Закрытие модалки благодарности
  if (document.querySelector('.thanks-modal__wrapper')) {
    const thanksWrapper = document.querySelector('.thanks-modal__wrapper');
    const closeThanks = () => {
      thanksWrapper.classList.remove('show');
      unlockScroll();
    };
    thanksWrapper.querySelector('.thanks-modal__btn')?.addEventListener('click', closeThanks);
    thanksWrapper.querySelector('.thanks-modal__close')?.addEventListener('click', closeThanks);
    thanksWrapper.addEventListener('click', e => {
      if (e.target.classList.contains('thanks-modal__wrapper')) closeThanks();
    });
  }

  // Закрытие модалки ошибки + кнопка "попробовать ещё раз"
  if (document.querySelector('.error-modal__wrapper')) {
    const errorWrapper = document.querySelector('.error-modal__wrapper');
    const closeError = () => {
      errorWrapper.classList.remove('show');
      unlockScroll();
    };
    errorWrapper.querySelector('.error-modal__close')?.addEventListener('click', closeError);
    errorWrapper.querySelector('.error-modal__retry-btn')?.addEventListener('click', reopenOrderFormModal);
    errorWrapper.addEventListener('click', e => {
      if (e.target.classList.contains('error-modal__wrapper')) closeError();
    });
  }

  if (document.querySelector('#phone-input')) {
    document.querySelector('#phone-input').addEventListener('click', function() {
      this.value = '+375'
    }, {
      once: true
    });
  }
  

  if (window.innerWidth > 768 && document.querySelector('#modalImage')) {
    const triggerElements = document.querySelectorAll('.product__picture-img');
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalOverlay = document.querySelector('.image-modal__overlay');
    const modalClose = document.querySelector('.image-modal__close');

    triggerElements.forEach(trigger => {
      trigger.addEventListener('click', function () {
        const img = this.querySelector('img');
        if (img) {
          modalImage.src = img.dataset.full || img.src;
          modal.classList.add('active');
        }
      });
    });

    function closeModal() {
      modal.classList.remove('active');
      modalImage.src = '';
    }

    modalOverlay.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  } 

  if (document.querySelector('.table__inner') && window.innerWidth > 768) {
    document.querySelectorAll('.table__inner').forEach(item => {
      item.style.cssText = `max-width: ${window.innerWidth - document.querySelector('.sidebar').offsetWidth - parseInt(getComputedStyle(document.querySelector('.sidebar')).marginRight, 10) - 70}px`;
    });
    window.addEventListener('resize', debounce(() => {
      document.querySelectorAll('.table__inner').forEach(item => {
        item.style.cssText = `max-width: ${window.innerWidth - document.querySelector('.sidebar').offsetWidth - parseInt(getComputedStyle(document.querySelector('.sidebar')).marginRight, 10) - 70}px`;
      });
    }));
  }

  // Проверка формата персональных данных в форме заказа (общая для обычного заказа и распродажи).
  // Используем нативный Constraint Validation API: ставим setCustomValidity на неверные поля
  // и показываем подсказку у первого из них через reportValidity(). Возвращает true, если всё ок.
  function validateOrderFields(form) {
    // Мягкие проверки: главное — что поле заполнено осмысленно, а телефон/индекс похожи на формат.
    const rules = [
      // Ровно 3 слова (Фамилия Имя Отчество), регистр любой; допускаем дефис в слове.
      { name: 'fullName', test: v => /^[А-Яа-яЁёA-Za-z-]+(?:\s+[А-Яа-яЁёA-Za-z-]+){2}$/.test(v.trim()), msg: 'Введите ФИО полностью: фамилия, имя и отчество (3 слова)' },
      { name: 'phone',    test: v => /^\+/.test(v.trim()) && v.replace(/\D/g, '').length >= 5, msg: 'Номер должен начинаться с + (например +375…)' },
      { name: 'city',     test: v => v.trim().length >= 2,             msg: 'Укажите город' },
      { name: 'address',  test: v => v.trim().length >= 3,             msg: 'Укажите адрес доставки' },
      { name: 'index',    test: v => /^\d{5,6}$/.test(v.trim()),       msg: 'Почтовый индекс — 6 цифр' },
    ];

    let firstInvalid = null;
    rules.forEach(rule => {
      const field = form.querySelector(`[name="${rule.name}"]`);
      if (!field) return;
      field.setCustomValidity('');                 // сбрасываем прошлую ошибку
      if (!rule.test(field.value)) {
        field.setCustomValidity(rule.msg);
        if (!firstInvalid) firstInvalid = field;
      }
    });

    if (firstInvalid) {
      // reportValidity только на нашем поле — иначе проверка всей формы цепляет инпуты калькулятора
      firstInvalid.reportValidity();
      return false;
    }
    return true;
  }

  // New Order
  async function makeOrder() {
    const form = document.getElementById("orderForm");
    if (!validateOrderFields(form)) return false;

    const oldPrice = +form.querySelector('.tabs__item.active .calc__count-summ').textContent.slice(0, -2);
    form.querySelector('.tabs__item.active .calc__count-btn').click();
    const newPrice = +form.querySelector('.tabs__item.active .calc__count-summ').textContent.slice(0, -2);

    if (oldPrice !== newPrice) {
      form.querySelector('.tabs__item.active .calc__count-summ').classList.add('fail');
      setTimeout(() => form.querySelector('.tabs__item.active .calc__count-summ').classList.remove('fail'), 3000);
      return false;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const now = new Date();
    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    };
    const formatted = now.toLocaleString("ru-RU", options).replace(",", "");

    const imgURL = document.querySelector('.product__picture-img img').src;
    const imgName = document.querySelector('.product__picture-name').textContent;
    const imgAuthor = document.querySelector('.product__picture-author').textContent;

    let formDataSorted;
    if (document.querySelector('.submit-modal__calc #painting-tab').classList.contains('active')) {
      const price = form.querySelector('.calc__count-summ--painting').textContent.slice(0, -1);
      formDataSorted = [formatted, price, 'Твёрдый', data.onframeLength, data.onframeHeight, data.holder, data.material, data.stretch ? data.stretch : '-', data.frameType ? data.frameType : '-', '-', '-', '-', '-', data.fullName, data.phone, data.city, data.address, data.index, imgURL, imgName, imgAuthor];
    } else {
      const price = form.querySelector('.calc__count-summ--wallpaper').textContent.slice(0, -1);
      formDataSorted = [formatted, price, 'Рулон', data.rollLength, data.rollHeight, '-', '-', '-', '-', data.rollType, data.wallpaperType ? data.wallpaperType : '-', data.texture ? data.texture : '-', data.lamination ? 'да' : 'нет', data.fullName, data.phone, data.city, data.address, data.index, imgURL, imgName, imgAuthor];
    }

    setModalLoading(true);
    try {
      await fetch('https://script.google.com/macros/s/AKfycbwz_UnxXM0uh9zhTpOGWHC7KXF0Kr1E8CpTmk0glHb4TfouyhjxOUD7OOE0K5Tju-N6NQ/exec', {
        method: 'POST',
        mode: 'no-cors',  // Обход CORS — Apps Script Web App не отдаёт корректные заголовки на preflight
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formDataSorted }),
      });
      // С no-cors нельзя читать response.ok, так что просто успех
      form.reset();
      form.querySelector(".calc__size-select--width").dispatchEvent(new Event('change'));
      setModalLoading(false);
      showThanksModal();
    } catch (error) {
      console.error('Ошибка:', error);
      setModalLoading(false);
      showErrorModal();
    }
  }

  if (document.getElementById("orderForm")) {
    const orderForm = document.getElementById("orderForm");
    // Сбрасываем «залипшую» customValidity при правке поля — иначе нативная проверка
    // блокирует submit ещё до его срабатывания, и форму нельзя отправить после первой ошибки.
    orderForm.addEventListener("input", e => {
      if (e.target.name) e.target.setCustomValidity('');
    });
    orderForm.addEventListener("submit", async e => {
      e.preventDefault();
      makeOrder();
    });
  }


  // Sale
  if (document.querySelector('.sale__list')) {
    const spreadsheetId = "1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY";
    const apiKey = "AIzaSyCFJMCfcE0B1ZaUs0DatbPAaZz_Wp3W8ZU";
    const range = "Распродажа";

    const CACHE_KEY = "saleProducts_cache";
    const CACHE_TIME_KEY = "saleProducts_cache_time";
    const CACHE_DURATION = 5 * 60 * 1000;

    const headerMapping = {
      "Изображение": "URL",
      "Название": "name",
      "Автор": "author",
      "Тип": "type",
      "Новая цена": "newPrice",
      "Старая цена": "oldPrice",
      "Длина": "length",
      "Высота": "height",
      "Тип носителя": "holderType",
      "Тип холста": "canvasType",
      "Тип рулона": "rollType",
      "Тип обоев": "wallpaperType",
      "Текстура": "texture",
      "Ламинация": "lamination",
      "Дата": "date",
      "ФИО": "fullName",
      "Телефон": "phone",
      "Город": "city",
      "Адрес": "address",
      "Индекс": "index",
      "Примечания": "notes",
      "Статус": "status"
    };

    const numericFields = ["newPrice", "oldPrice", "length", "height"];

    function toNum(value) {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }

    function isValidUrl(string) {
      try {
        const u = new URL(string);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch { return false; }
    }

    // === ГЛОБАЛЬНЫЙ МАССИВ ВСЕХ ТОВАРОВ ===
    let allSaleProducts = []; // ← сюда сохраняем ВСЕ товары (даже заказанные)
    let selectedSaleProduct = null; // ← товар, открытый в модалке (для оформления заказа)

    // === ПОЛУЧЕНИЕ ДАННЫХ ===
    async function fetchFromGoogle() {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (err) {
        console.error('Распродажа: ошибка загрузки, отдаю кэш (даже просроченный)', err);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) return JSON.parse(cached);
        throw err;
      }

      const [header, ...rows] = data.values || [];
      if (!header) return [];

      return rows.map((row, index) => {
        let obj = { id: index }; // уникальный ID
        header.forEach((col, i) => {
          let value = row[i] || "";
          if (value && value !== "-") {
            const engKey = headerMapping[col];
            if (engKey) {
              obj[engKey] = numericFields.includes(engKey) ? toNum(value) : value;
            }
          }
        });
        return obj;
      });
    }

    // === КЭШ ===
    function saveToCache(products) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(products));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    }

    function loadFromCache() {
      const cached = localStorage.getItem(CACHE_KEY);
      const time = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && time && (Date.now() - parseInt(time)) < CACHE_DURATION) {
        return JSON.parse(cached);
      }
      return null;
    }

    // === РЕНДЕР КАРТОЧЕК ===
    function renderSale(products) {
      const container = document.querySelector('.sale__list');
      if (!container) return;

      container.innerHTML = '';

      if (products.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sale__empty';
        empty.innerHTML = `
          <p class="sale__empty-title">Пока тут пусто</p>
          <p class="sale__empty-text">Новые товары на распродаже скоро появятся</p>
        `;
        container.appendChild(empty);
        return;
      }

      products.forEach(product => {
        const imgSrc = isValidUrl(product.URL) ? product.URL : 'https://placehold.co/200x130';

        const item = document.createElement('a');
        item.href = '#';
        item.className = 'sale__item';
        item.dataset.id = product.id; // ← ВАЖНО: data-id

        item.innerHTML = `
          <div class="sale__item-img">
            <img loading="lazy" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.name)}">
          </div>
          <h5 class="sale__item-title">${escapeHtml(product.name)} - ${escapeHtml(product.author)}</h5>
          <div class="sale__item-price">
            <span>${escapeHtml(product.newPrice)} бел. р.</span>
            ${product.oldPrice ? `<s class="sale__item-price--old">${escapeHtml(product.oldPrice)} бел. р.</s>` : ''}
          </div>
        `;

        container.appendChild(item);
      });
    }

    // === ОБРАБОТЧИК КЛИКА ===
    document.querySelector('.sale__list')?.addEventListener('click', function(e) {
      const card = e.target.closest('.sale__item');
      if (!card) return;

      e.preventDefault(); // отменяем переход по #

      const id = parseInt(card.dataset.id);
      const product = allSaleProducts.find(p => p.id === id);

      if (product) {
        selectedSaleProduct = product; // запоминаем для оформления заказа
        const modal = document.querySelector('.product__wrapper');
        modal.querySelector('.product__picture-img img').setAttribute('src', isValidUrl(product.URL) ? product.URL : 'https://placehold.co/200x130');
        modal.querySelector('.product__picture-name').textContent = product.name;
        modal.querySelector('.product__picture-author').textContent = product.author;
        modal.querySelector('.sale-product__price span').textContent = product.newPrice + " бел. р.";
        modal.querySelector('.sale-product__price .sale-product__price--old').textContent = product.oldPrice + " бел. р.";
        const paramsList = modal.querySelector('.sale-product__params-list');
        let paramsHtml = `<li class="sale-product__params-item">
                                  <span class="sale-product__params-property">Размер: </span>
                                  <span class="sale-product__params-value">${escapeHtml(product.length)}x${escapeHtml(product.height)}</span>
                                </li>`
        if (product.type == 'Твёрдый носитель') {
          paramsHtml += `<li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Тип носителя: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.holderType)}</span>
                                  </li>
                                  <li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Тип холста: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.canvasType)}</span>
                                  </li>`
        } else if (product.type == 'В рулоне') {
          if (product.wallpaperType) {
            paramsHtml += `<li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Тип рулона: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.rollType)} - ${escapeHtml(product.wallpaperType)}</span>
                                  </li>`
          } else {
            paramsHtml += `<li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Тип рулона: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.rollType)}</span>
                                  </li>`
          }
          if (product.texture) {
            paramsHtml += `<li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Текстура: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.texture)}</span>
                                  </li>`
          }
          if (product.lamination) {
            paramsHtml += `<li class="sale-product__params-item">
                                    <span class="sale-product__params-property">Ламинация: </span>
                                    <span class="sale-product__params-value">${escapeHtml(product.lamination)}</span>
                                  </li>`
          }
        }
        paramsList.innerHTML = paramsHtml;
        document.querySelector('.product__wrapper').classList.add('show');
        lockScroll();
        document.querySelector('.burger').classList.add('active');
      }
    });

    // === ОФОРМЛЕНИЕ ЗАКАЗА ИЗ РАСПРОДАЖИ ===
    const saleForm = document.querySelector('#seleOrderModal');
    if (saleForm) {
      // Сбрасываем «залипшую» customValidity при правке поля (см. orderForm выше).
      saleForm.addEventListener('input', e => {
        if (e.target.name) e.target.setCustomValidity('');
      });
      saleForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!selectedSaleProduct) return;
        if (!validateOrderFields(saleForm)) return;

        const data = Object.fromEntries(new FormData(saleForm).entries());
        const saleOrder = {
          rowId: selectedSaleProduct.id, // строка в листе = rowId + 2 (см. Apps Script)
          fullName: data.fullName,
          phone: data.phone,
          city: data.city,
          address: data.address,
          index: data.index,
        };

        setModalLoading(true);
        try {
          await fetch('https://script.google.com/macros/s/AKfycbwz_UnxXM0uh9zhTpOGWHC7KXF0Kr1E8CpTmk0glHb4TfouyhjxOUD7OOE0K5Tju-N6NQ/exec', {
            method: 'POST',
            mode: 'no-cors',  // Обход CORS — Apps Script Web App не отдаёт корректные заголовки на preflight
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleOrder }),
          });

          // Товар заказан: убираем из списка и сбрасываем кэш, чтобы не показывался снова
          const orderedId = selectedSaleProduct.id;
          allSaleProducts = allSaleProducts.map(p => p.id === orderedId ? { ...p, status: 'Заказано' } : p);
          saveToCache(allSaleProducts);
          renderSale(allSaleProducts.filter(p => p.status === 'В продаже'));

          saleForm.reset();
          selectedSaleProduct = null;
          setModalLoading(false);
          document.querySelector('.product__wrapper')?.classList.remove('show');
          showThanksModal();
        } catch (error) {
          console.error('Ошибка:', error);
          setModalLoading(false);
          showErrorModal();
        }
      });
    }

    // === ОСНОВНАЯ ЛОГИКА ===
    async function loadSales() {
      let products = loadFromCache();

      if (!products) {
        try {
          products = await fetchFromGoogle();
          saveToCache(products);
        } catch (err) {
          console.error('Распродажа: нет ни сети, ни кэша', err);
          renderSale([]);
          return;
        }
      }

      allSaleProducts = products; // ← сохраняем ВСЕ товары

      const available = products.filter(p => p.status === "В продаже");
      renderSale(available);

      setInterval(refreshIfNeeded, 10000);
    }

    async function refreshIfNeeded() {
      const time = localStorage.getItem(CACHE_TIME_KEY);
      if (!time || (Date.now() - parseInt(time)) >= CACHE_DURATION) {
        try {
          const newProducts = await fetchFromGoogle();
          saveToCache(newProducts);
          allSaleProducts = newProducts;

          const available = newProducts.filter(p => p.status === "В продаже");
          renderSale(available); // или updateSaleProducts()
        } catch (err) {
          console.error('Распродажа: обновление не удалось, оставляю текущий список', err);
        }
      }
    }

    loadSales();
  }

});