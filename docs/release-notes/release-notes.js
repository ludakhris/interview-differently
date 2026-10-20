// Timeline: the last RECENT_DAYS days stay open day by day; older updates roll into
// collapsed month groups. Filter buttons and a search box narrow both the timeline and the entries.
;(function () {
  var RECENT_DAYS = 5
  var entries = Array.prototype.slice.call(document.querySelectorAll('.entry'))
  var toc = document.getElementById('toc')
  var MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  var DAY = 86400000
  function when(e) {
    var t = e.querySelector('time')
    var d = new Date((t && t.getAttribute('datetime')) + 'T00:00:00Z')
    return {
      d: d,
      label: MONTHS[d.getUTCMonth()].slice(0, 3) + ' ' + d.getUTCDate(),
      month: MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
    }
  }
  var newest = Math.max.apply(
    null,
    entries.map(function (e) {
      return when(e).d.getTime()
    })
  )
  function item(e, day) {
    var li = document.createElement('li')
    li.className = 'tl-item'
    li.dataset.status = e.dataset.status
    li.dataset.day = day
    li.dataset.id = e.id
    var a = document.createElement('a')
    a.href = '#' + e.id
    a.textContent = e.dataset.short || e.querySelector('h2').textContent
    var chip = document.createElement('span')
    chip.className = 'chip ' + e.dataset.status
    chip.textContent = e.dataset.status === 'review' ? 'IN REVIEW' : 'SHIPPED'
    var sum = document.createElement('span')
    sum.className = 'tl-sum'
    sum.textContent = e.dataset.summary || ''
    sum.title = e.dataset.summary || ''
    li.appendChild(a)
    li.appendChild(chip)
    li.appendChild(sum)
    return li
  }
  var recent = []
  var older = {}
  var order = []
  entries.forEach(function (e) {
    var w = when(e)
    if ((newest - w.d.getTime()) / DAY < RECENT_DAYS) recent.push([e, w])
    else {
      if (!older[w.month]) {
        older[w.month] = []
        order.push(w.month)
      }
      older[w.month].push([e, w])
    }
  })
  function days(list, into) {
    var last = null
    list.forEach(function (pair) {
      if (pair[1].label !== last) {
        var h = document.createElement('li')
        h.className = 'tl-day'
        h.dataset.day = pair[1].label
        h.textContent = pair[1].label
        into.appendChild(h)
        last = pair[1].label
      }
      into.appendChild(item(pair[0], pair[1].label))
    })
  }
  days(recent, toc)
  order.forEach(function (m) {
    var li = document.createElement('li')
    li.className = 'tl-month'
    var det = document.createElement('details')
    var sm = document.createElement('summary')
    sm.appendChild(document.createTextNode(m))
    var small = document.createElement('small')
    small.textContent = older[m].length + (older[m].length === 1 ? ' update' : ' updates')
    sm.appendChild(small)
    det.appendChild(sm)
    var inner = document.createElement('ol')
    days(older[m], inner)
    det.appendChild(inner)
    li.appendChild(det)
    toc.appendChild(li)
  })

  var status = 'all'
  var q = ''
  var qbox = document.getElementById('q')
  var none = document.getElementById('none')
  var buttons = document.querySelectorAll('[data-filter]')
  var text = {}
  entries.forEach(function (e) {
    text[e.id] = (e.textContent + ' ' + (e.dataset.short || '')).toLowerCase()
  })
  function matches(e) {
    return (status === 'all' || e.dataset.status === status) && (!q || text[e.id].indexOf(q) !== -1)
  }
  var countsEl = document.getElementById('counts')
  function counts() {
    var r = entries.filter(function (e) {
      return e.dataset.status === 'review'
    }).length
    countsEl.textContent =
      r +
      ' in review \u00b7 ' +
      (entries.length - r) +
      ' shipped \u00b7 ' +
      entries.length +
      ' updates'
  }
  counts()
  function apply() {
    var ok = {}
    var count = 0
    entries.forEach(function (e) {
      e.hidden = !matches(e)
      if (!e.hidden) {
        ok[e.id] = true
        count++
      }
    })
    none.hidden = count > 0
    var shownDays = {}
    Array.prototype.forEach.call(toc.querySelectorAll('.tl-item'), function (li) {
      li.hidden = !ok[li.dataset.id]
      if (!li.hidden)
        shownDays[li.parentNode === toc ? 'r:' + li.dataset.day : li.dataset.id] = true
    })
    Array.prototype.forEach.call(toc.querySelectorAll('.tl-day'), function (h) {
      var sib = h.nextElementSibling
      var any = false
      while (sib && !sib.classList.contains('tl-day') && !sib.classList.contains('tl-month')) {
        if (sib.classList.contains('tl-item') && !sib.hidden) any = true
        sib = sib.nextElementSibling
      }
      h.hidden = !any
    })
    Array.prototype.forEach.call(toc.querySelectorAll('.tl-month'), function (m) {
      var vis = m.querySelectorAll('.tl-item:not([hidden])').length
      m.hidden = vis === 0
      var det = m.querySelector('details')
      if (q || status !== 'all') det.open = vis > 0
    })
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      status = b.dataset.filter
      buttons.forEach(function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false')
      })
      apply()
    })
  })
  qbox.addEventListener('input', function () {
    q = qbox.value.trim().toLowerCase()
    apply()
  })

  // Screenshot viewer: stays on the page, steps through one entry's screenshots.
  var lb = document.createElement('div')
  lb.className = 'lb'
  lb.hidden = true
  lb.setAttribute('role', 'dialog')
  lb.setAttribute('aria-modal', 'true')
  lb.setAttribute('aria-label', 'Screenshot viewer')
  lb.innerHTML =
    '<button type="button" class="lb-close" aria-label="Close viewer">\u00d7</button>' +
    '<div class="lb-stage">' +
    '<button type="button" class="lb-prev" aria-label="Previous screenshot">\u2039</button>' +
    '<img alt="" />' +
    '<button type="button" class="lb-next" aria-label="Next screenshot">\u203a</button>' +
    '</div>' +
    '<div class="lb-cap" aria-live="polite"></div>'
  document.body.appendChild(lb)
  var img = lb.querySelector('img')
  var cap = lb.querySelector('.lb-cap')
  var prev = lb.querySelector('.lb-prev')
  var next = lb.querySelector('.lb-next')
  var close = lb.querySelector('.lb-close')
  var set = []
  var at = 0
  var opener = null

  function show(i) {
    at = i
    var a = set[i]
    var im = a.querySelector('img')
    img.src = a.href
    img.alt = im ? im.alt : ''
    var fc = a.parentNode.querySelector('figcaption')
    cap.textContent = ''
    cap.appendChild(document.createTextNode(fc ? fc.textContent.replace(/\s+/g, ' ').trim() : ''))
    var small = document.createElement('small')
    small.textContent = i + 1 + ' of ' + set.length
    cap.appendChild(small)
    prev.disabled = i === 0
    next.disabled = i === set.length - 1
    // Warm the neighbours so stepping feels instant.
    ;[i - 1, i + 1].forEach(function (j) {
      if (set[j]) new Image().src = set[j].href
    })
  }
  function open(list, i, from) {
    set = list
    opener = from
    lb.hidden = false
    document.body.style.overflow = 'hidden'
    show(i)
    close.focus()
  }
  function shut() {
    lb.hidden = true
    document.body.style.overflow = ''
    if (opener) opener.focus()
  }
  document.querySelectorAll('.shots').forEach(function (g) {
    var links = Array.prototype.slice.call(g.querySelectorAll('a'))
    links.forEach(function (a, i) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault()
        open(links, i, a)
      })
    })
  })
  prev.addEventListener('click', function () {
    if (at > 0) show(at - 1)
  })
  next.addEventListener('click', function () {
    if (at < set.length - 1) show(at + 1)
  })
  close.addEventListener('click', shut)
  lb.addEventListener('click', function (ev) {
    if (ev.target === lb || ev.target.classList.contains('lb-stage')) shut()
  })
  document.addEventListener('keydown', function (ev) {
    if (lb.hidden) return
    if (ev.key === 'Escape') shut()
    else if (ev.key === 'ArrowLeft' && at > 0) show(at - 1)
    else if (ev.key === 'ArrowRight' && at < set.length - 1) show(at + 1)
    else if (ev.key === 'Tab') {
      var f = [close, prev, next].filter(function (b) {
        return !b.disabled
      })
      var i = f.indexOf(document.activeElement)
      ev.preventDefault()
      f[(i + (ev.shiftKey ? f.length - 1 : 1)) % f.length].focus()
    }
  })
})()
