// Инициализация базы данных
const db = new EventDatabase()

// Элементы карты
const map = document.getElementById('map')
const container = document.getElementById('mapContainer')
const markerContainer = document.getElementById('markerContainer')

// Переменные для зума и перемещения
let scale = 1
let translateX = 0
let translateY = 0

// Ограничения зума
const MIN_SCALE = 1
const MAX_SCALE = 5

// Переменные для drag
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartTranslateX = 0
let dragStartTranslateY = 0

// Переменные для определения клика vs драга
let mouseDownX = 0
let mouseDownY = 0
const CLICK_THRESHOLD = 5

// Координаты для нового события
let newEventCoords = null

// Переменные для рисования линий
let isLineMode = false
let lineStartPoint = null
let lineEndPoint = null
let tempLine = null

// Инициализация
window.addEventListener('load', async () => {
	try {
		await db.init()
		await loadEvents()
		setInterval(removeExpiredEvents, 60000)

		// Добавляем обработчики для кнопок
		document
			.getElementById('lineToolButton')
			.addEventListener('click', toggleLineMode)
		document
			.getElementById('liveNewsButton')
			.addEventListener('click', showLiveNewsNotification)
	} catch (error) {
		console.error('Ошибка при инициализации:', error)
	}
})

// Загрузка событий
async function loadEvents() {
	try {
		const events = await db.getAllEvents()
		markerContainer.innerHTML = ''
		events
			.filter(e => e.status === 'approved')
			.forEach(event => {
				if (event.isLine) {
					createLineElement(event)
				} else {
					createEventMarker(event)
				}
			})

		// Сохраняем текущие события для отслеживания изменений
		window.lastEventsData = JSON.stringify(
			events.filter(e => e.status === 'approved')
		)
	} catch (error) {
		console.error('Ошибка загрузки мероприятий:', error)
	}
}

// Удаление истекших событий
async function removeExpiredEvents() {
	try {
		const events = await db.getAllEvents()
		const currentTime = new Date().getTime()

		for (const event of events) {
			if (new Date(event.end).getTime() < currentTime) {
				await db.deleteEvent(event.id)
				const marker = document.querySelector(`[data-event-id="${event.id}"]`)
				if (marker) marker.remove()
			}
		}
	} catch (error) {
		console.error('Ошибка при удалении истекших мероприятий:', error)
	}
}

// Создание маркера
function createEventMarker(event) {
	const marker = document.createElement('div')
	marker.className = `event-marker ${event.type}`
	marker.style.left = `${event.x}%`
	marker.style.top = `${event.y}%`
	marker.dataset.eventId = event.id

	marker.addEventListener('click', e => {
		e.stopPropagation()
		showEventDetails(event)
	})

	markerContainer.appendChild(marker)
	updateMarkersTransform()
}

// Создание линии
function createLineElement(event) {
	// Проверяем, существует ли уже элемент для этой линии
	const existingLine = document.querySelector(`[data-event-id="${event.id}"]`)
	if (existingLine) {
		existingLine.remove()
	}

	const lineContainer = document.createElement('div')
	lineContainer.className = 'event-line'
	lineContainer.style.position = 'absolute'
	lineContainer.style.left = '0'
	lineContainer.style.top = '0'
	lineContainer.style.width = '100%'
	lineContainer.style.height = '100%'
	lineContainer.style.pointerEvents = 'none'
	lineContainer.dataset.eventId = event.id

	const line = document.createElement('div')
	line.className = 'line-element'
	line.style.position = 'absolute'
	line.style.backgroundColor = getLineColor(event.type)
	line.style.height = '3px'
	line.style.left = `${event.x1}%`
	line.style.top = `${event.y1}%`

	// Вычисляем длину и угол линии
	const deltaX = event.x2 - event.x1
	const deltaY = event.y2 - event.y1
	const length = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2))
	const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI

	line.style.width = `${length}%`
	line.style.transformOrigin = '0 0'
	line.style.transform = `rotate(${angle}deg)`
	line.style.pointerEvents = 'auto'
	line.style.cursor = 'pointer'

	line.addEventListener('click', e => {
		e.stopPropagation()
		showEventDetails(event)
	})

	lineContainer.appendChild(line)
	markerContainer.appendChild(lineContainer)
	updateMarkersTransform()
}

function getLineColor(type) {
	const colors = {
		government: '#FF0000',
		civilian: '#FF0000',
		incident: '#FF0000',
	}
	return colors[type] || '#FF0000'
}

// Применение трансформации
function applyTransform() {
	map.style.transformOrigin = '0 0'
	markerContainer.style.transformOrigin = '0 0'

	// Ограничиваем перемещение в пределах карты
	const containerRect = container.getBoundingClientRect()
	const mapWidth = map.offsetWidth * scale
	const mapHeight = map.offsetHeight * scale

	// Минимальные и максимальные значения translate
	const minTranslateX = containerRect.width - mapWidth
	const maxTranslateX = 0
	const minTranslateY = containerRect.height - mapHeight
	const maxTranslateY = 0

	// Ограничиваем translateX и translateY
	translateX = Math.min(maxTranslateX, Math.max(minTranslateX, translateX))
	translateY = Math.min(maxTranslateY, Math.max(minTranslateY, translateY))

	map.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
	markerContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`

	// Компенсируем масштаб для маркеров
	const markers = document.querySelectorAll('.event-marker')
	markers.forEach(marker => {
		marker.style.transform = `translate(-50%, -50%) scale(${1 / scale})`
	})
}

function updateMarkersTransform() {
	applyTransform()
}

// ==================== НОВАЯ СИСТЕМА ЗУМА ====================

container.addEventListener(
	'wheel',
	function (e) {
		e.preventDefault()

		// Шаг изменения масштаба
		const zoomSpeed = 0.2
		const delta = e.deltaY < 0 ? zoomSpeed : -zoomSpeed

		// Новый масштаб с ограничениями
		const oldScale = scale
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta))

		// Если масштаб не изменился, выходим
		if (oldScale === newScale) return

		// Получаем позицию курсора относительно контейнера
		const containerRect = container.getBoundingClientRect()
		const cursorX = e.clientX - containerRect.left
		const cursorY = e.clientY - containerRect.top

		// Вычисляем точку на карте (в координатах исходного изображения)
		// которая находится под курсором ДО зума
		const pointX = (cursorX - translateX) / oldScale
		const pointY = (cursorY - translateY) / oldScale

		// Применяем новый масштаб
		scale = newScale

		// Пересчитываем смещение так, чтобы точка осталась под курсором
		translateX = cursorX - pointX * scale
		translateY = cursorY - pointY * scale

		// Применяем трансформацию
		applyTransform()
	},
	{ passive: false }
)

// ==================== СИСТЕМА ПЕРЕТАСКИВАНИЯ ====================

container.addEventListener('mousedown', function (e) {
	// Игнорируем клик на маркере
	if (e.target.closest('.event-marker')) return

	isDragging = true
	dragStartX = e.clientX
	dragStartY = e.clientY
	dragStartTranslateX = translateX
	dragStartTranslateY = translateY
	mouseDownX = e.clientX
	mouseDownY = e.clientY

	container.style.cursor = 'grabbing'
})

window.addEventListener('mousemove', function (e) {
	if (!isDragging) return

	const deltaX = e.clientX - dragStartX
	const deltaY = e.clientY - dragStartY

	translateX = dragStartTranslateX + deltaX
	translateY = dragStartTranslateY + deltaY

	applyTransform()
})

window.addEventListener('mouseup', function (e) {
	if (!isDragging) return

	isDragging = false
	container.style.cursor = 'grab'

	// Проверяем, был ли это клик
	const moveX = Math.abs(e.clientX - mouseDownX)
	const moveY = Math.abs(e.clientY - mouseDownY)

	// Проверяем, не кликнули ли мы на элемент линии
	const isOnLineElement = e.target.closest('.line-element')
	const isOnMarker = e.target.closest('.event-marker')

	if (
		moveX < CLICK_THRESHOLD &&
		moveY < CLICK_THRESHOLD &&
		!isOnLineElement &&
		!isOnMarker
	) {
		// Это был клик на пустом месте - создаем событие
		handleMapClick(e)
	}
})

// Обработка клика по карте
function handleMapClick(e) {
	if (isLineMode) {
		handleLineClick(e)
		return
	}

	const containerRect = container.getBoundingClientRect()
	const clickX = e.clientX - containerRect.left
	const clickY = e.clientY - containerRect.top

	// Преобразуем координаты клика в координаты карты
	const mapX = (clickX - translateX) / scale
	const mapY = (clickY - translateY) / scale

	// Преобразуем в проценты относительно размера карты
	const mapWidth = map.offsetWidth
	const mapHeight = map.offsetHeight
	const x = (mapX / mapWidth) * 100
	const y = (mapY / mapHeight) * 100

	newEventCoords = { x, y }
	openEventModal()
}

// Функции для работы с линиями
function toggleLineMode() {
	isLineMode = !isLineMode
	const button = document.getElementById('lineToolButton')

	if (isLineMode) {
		button.classList.add('active')
		container.style.cursor = 'crosshair'
		lineStartPoint = null
		lineEndPoint = null
		// Показываем уведомление при активации режима рисования
		alert('Выберите две точки для установки мероприятия-линии')
	} else {
		button.classList.remove('active')
		container.style.cursor = 'grab'
		// Удаляем временные элементы, если есть
		if (tempLine) {
			tempLine.remove()
			tempLine = null
		}
		lineStartPoint = null
		lineEndPoint = null
	}
}

function handleLineClick(e) {
	const containerRect = container.getBoundingClientRect()
	const clickX = e.clientX - containerRect.left
	const clickY = e.clientY - containerRect.top

	// Преобразуем координаты клика в координаты карты
	const mapX = (clickX - translateX) / scale
	const mapY = (clickY - translateY) / scale

	// Преобразуем в проценты относительно размера карты
	const mapWidth = map.offsetWidth
	const mapHeight = map.offsetHeight
	const x = (mapX / mapWidth) * 100
	const y = (mapY / mapHeight) * 100

	if (!lineStartPoint) {
		// Устанавливаем начальную точку
		lineStartPoint = { x, y }
		// Создаем временную линию
		createTempLine(x, y, x, y)
	} else if (!lineEndPoint) {
		// Устанавливаем конечную точку
		lineEndPoint = { x, y }
		// Обновляем временную линию
		updateTempLine(lineStartPoint.x, lineStartPoint.y, x, y)
		// Открываем модальное окно для ввода данных
		openLineModal()
	}
}

function createTempLine(x1, y1, x2, y2) {
	if (tempLine) {
		tempLine.remove()
	}

	tempLine = document.createElement('div')
	tempLine.className = 'temp-line'
	tempLine.style.position = 'absolute'
	tempLine.style.left = '0'
	tempLine.style.top = '0'
	tempLine.style.width = '100%'
	tempLine.style.height = '100%'
	tempLine.style.pointerEvents = 'none'
	tempLine.style.zIndex = '999'

	const line = document.createElement('div')
	line.style.position = 'absolute'
	line.style.backgroundColor = '#FF0000'
	line.style.height = '2px'
	line.style.transformOrigin = '0 0'

	tempLine.appendChild(line)
	markerContainer.appendChild(tempLine)
	updateTempLine(x1, y1, x2, y2)
}

function updateTempLine(x1, y1, x2, y2) {
	if (!tempLine) return

	const line = tempLine.querySelector('div')
	const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
	const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI

	line.style.width = `${length}%`
	line.style.left = `${x1}%`
	line.style.top = `${y1}%`
	line.style.transform = `rotate(${angle}deg)`
}

function removeTempLine() {
	if (tempLine) {
		tempLine.remove()
		tempLine = null
	}
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================

function openEventModal() {
	document.getElementById('eventModal').style.display = 'flex'
}

function closeEventModal() {
	document.getElementById('eventModal').style.display = 'none'
	document.getElementById('eventForm').reset()
	newEventCoords = null

	// Убедимся, что режим рисования линии отключен при закрытии модального окна
	if (isLineMode) {
		isLineMode = false
		document.getElementById('lineToolButton').classList.remove('active')
		container.style.cursor = 'grab'

		// Удаляем временные элементы, если есть
		if (tempLine) {
			tempLine.remove()
			tempLine = null
		}
		lineStartPoint = null
		lineEndPoint = null
	}
}

function closeEventForm() {
	eventForm.classList.remove('active')
	eventForm.innerHTML = ''

	// Возобновляем автоматическое обновление
	startAutoRefresh()
}

function closeEventDetailsModal() {
	const modal = document.getElementById('eventDetailsModal')
	if (modal) {
		modal.style.display = 'none'
	}

	// Возобновляем автоматическое обновление
	startAutoRefresh()
}

// Новое модальное окно для линий
function openLineModal() {
	// Используем существующее модальное окно, но добавим скрытое поле для типа
	const form = document.getElementById('eventForm')

	// Добавляем скрытое поле для указания, что это линия
	let lineTypeInput = document.getElementById('lineTypeInput')
	if (!lineTypeInput) {
		lineTypeInput = document.createElement('input')
		lineTypeInput.type = 'hidden'
		lineTypeInput.id = 'lineTypeInput'
		lineTypeInput.name = 'isLine'
		lineTypeInput.value = 'true'
		form.appendChild(lineTypeInput)
	}

	// Открываем модальное окно
	openEventModal()
}

function closeLineModal() {
	closeEventModal()

	// Убираем скрытое поле
	const lineTypeInput = document.getElementById('lineTypeInput')
	if (lineTypeInput) {
		lineTypeInput.remove()
	}

	// Выходим из режима линии
	isLineMode = false
	document.getElementById('lineToolButton').classList.remove('active')
	container.style.cursor = 'grab'

	// Удаляем временную линию
	removeTempLine()
	lineStartPoint = null
	lineEndPoint = null
}

function showEventDetails(event) {
	const modal = document.getElementById('eventDetailsModal')
	document.getElementById('detailsEventName').textContent = event.name
	document.getElementById('detailsEventType').textContent = getEventTypeText(
		event.type
	)
	document.getElementById('detailsEventStart').textContent = formatDateTime(
		event.start
	)
	document.getElementById('detailsEventEnd').textContent = formatDateTime(
		event.end
	)
	document.getElementById('detailsEventDescription').textContent =
		event.description
	modal.style.display = 'flex'
}

function closeAdminPanel() {
	document.getElementById('adminPanelModal').style.display = 'none'

	// Возобновляем автоматическое обновление
	startAutoRefresh()
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function formatDateTime(dateStr) {
	if (!dateStr) return 'Не указано'
	return new Date(dateStr).toLocaleString('ru-RU')
}

function getEventTypeText(type) {
	const types = {
		government: 'Государственное',
		civilian: 'Гражданское',
		incident: 'Происшествие',
	}
	return types[type] || type
}

function getStatusText(status) {
	const statuses = {
		pending: 'На рассмотрении',
		approved: 'Одобрено',
		rejected: 'Отклонено',
	}
	return statuses[status] || status
}

// ==================== СОЗДАНИЕ СОБЫТИЯ ====================

document
	.getElementById('eventForm')
	.addEventListener('submit', async function (e) {
		e.preventDefault()

		// Проверяем, является ли это созданием линии
		const isLine = document.getElementById('lineTypeInput')

		if (isLine) {
			// Создание линии
			await createLineEvent()
		} else {
			// Создание обычного события
			await createRegularEvent()
		}
	})

async function createRegularEvent() {
	if (!newEventCoords) return

	const eventData = {
		name: document.getElementById('eventName').value,
		type: document.getElementById('eventType').value,
		start: document.getElementById('eventStart').value,
		end: document.getElementById('eventEnd').value,
		description: document.getElementById('eventDescription').value,
		x: newEventCoords.x,
		y: newEventCoords.y,
		status: 'pending',
		createdAt: new Date().toISOString(),
	}

	try {
		const result = await db.addEvent(eventData)
		closeEventModal()
		alert(result.message || 'Событие добавлено в очередь на одобрение')

		// Обновляем данные для отслеживания изменений
		const events = await db.getAllEvents()
		window.lastEventsData = JSON.stringify(
			events.filter(e => e.status === 'approved')
		)
	} catch (error) {
		console.error('Ошибка при создании мероприятия:', error)
		alert('Не удалось создать мероприятие')
	}
}

async function createLineEvent() {
	if (!lineStartPoint || !lineEndPoint) return

	const eventData = {
		name: document.getElementById('eventName').value,
		type: document.getElementById('eventType').value,
		start: document.getElementById('eventStart').value,
		end: document.getElementById('eventEnd').value,
		description: document.getElementById('eventDescription').value,
		x1: lineStartPoint.x,
		y1: lineStartPoint.y,
		x2: lineEndPoint.x,
		y2: lineEndPoint.y,
		isLine: true,
		status: 'pending',
		createdAt: new Date().toISOString(),
	}

	try {
		const result = await db.addEvent(eventData)
		closeLineModal()
		alert(result.message || 'Линия добавлена в очередь на одобрение')

		// Обновляем данные для отслеживания изменений
		const events = await db.getAllEvents()
		window.lastEventsData = JSON.stringify(
			events.filter(e => e.status === 'approved')
		)
	} catch (error) {
		console.error('Ошибка при создании линии:', error)
		alert('Не удалось создать линию')
	}
}

// ==================== АДМИН-ПАНЕЛЬ ====================

let isAdmin = false
const ADMIN_CODE = '4041'

function openAdminLogin() {
	document.getElementById('adminLoginModal').style.display = 'flex'
}

function closeAdminLogin() {
	document.getElementById('adminLoginModal').style.display = 'none'
	document.getElementById('adminCode').value = ''
}

function handleAdminLogin() {
	const code = document.getElementById('adminCode').value
	if (code === ADMIN_CODE) {
		isAdmin = true
		document.getElementById('adminLoginModal').style.display = 'none'
		openAdminPanel()
	} else {
		alert('Неверный код')
	}
}

async function openAdminPanel() {
	if (!isAdmin) {
		alert('Нет прав доступа.')
		return
	}
	try {
		await loadAdminEvents()
		document.getElementById('adminPanelModal').style.display = 'flex'
		switchAdminTab('events')
	} catch (error) {
		console.error('Ошибка при открытии админ-панели:', error)
		alert('Не удалось открыть админ-панель')
	}
}

async function loadAdminEvents() {
	try {
		const allEvents = await db.getAllEvents()
		const activeEvents = allEvents.filter(e => e.status === 'approved')
		const list = document.getElementById('adminEventList')
		list.innerHTML = ''

		if (activeEvents.length === 0) {
			list.innerHTML = '<p class="coming-soon">Нет активных мероприятий</p>'
			return
		}

		activeEvents.forEach(event => {
			const eventDiv = document.createElement('div')
			eventDiv.className = 'admin-event-item'
			eventDiv.innerHTML = `
				<div class="event-info">
					<strong>${event.name}</strong>
					<span>${formatDateTime(event.start)}</span>
				</div>
				<button class="delete-button" onclick="deleteEvent('${
					event.id
				}')">Удалить</button>
			`
			list.appendChild(eventDiv)
		})
	} catch (error) {
		console.error('Ошибка при загрузке мероприятий:', error)
		alert('Не удалось загрузить список мероприятий')
	}
}

async function deleteEvent(eventId) {
	if (!isAdmin) return alert('Нет прав.')
	if (!confirm('Вы уверены, что хотите удалить это мероприятие?')) return

	try {
		await db.deleteEvent(eventId)
		// Удаляем маркер с карты
		const marker = document.querySelector(`[data-event-id="${eventId}"]`)
		if (marker) marker.remove()
		await loadAdminEvents()
		await loadEvents()

		// Принудительно обновляем данные для отслеживания изменений
		const events = await db.getAllEvents()
		window.lastEventsData = JSON.stringify(
			events.filter(e => e.status === 'approved')
		)
	} catch (error) {
		console.error('Ошибка при удалении мероприятия:', error)
		alert('Не удалось удалить мероприятие')
	}
}

function switchAdminTab(tabName) {
	document.querySelectorAll('.tab-button').forEach(button => {
		button.classList.remove('active')
	})
	document
		.querySelector(`.tab-button[onclick*="${tabName}"]`)
		.classList.add('active')

	document.getElementById('eventsTab').style.display =
		tabName === 'events' ? 'block' : 'none'
	document.getElementById('queueTab').style.display =
		tabName === 'queue' ? 'block' : 'none'

	if (tabName === 'events') {
		loadAdminEvents()
	} else if (tabName === 'queue') {
		loadQueuedEvents()
	}
}

async function loadQueuedEvents() {
	try {
		const queuedEvents = await db.getQueuedEvents()
		const list = document.getElementById('queueEventList')
		list.innerHTML = ''

		if (queuedEvents.length === 0) {
			list.innerHTML = '<p class="coming-soon">Нет событий в очереди</p>'
			return
		}

		queuedEvents.forEach(event => {
			const eventDiv = document.createElement('div')
			eventDiv.className = `queue-item ${event.status}`
			eventDiv.innerHTML = `
				<div class="event-details">
					<strong>${event.name}</strong>
					<span class="event-type">${getEventTypeText(event.type)}</span>
					<span class="event-date">Создано: ${formatDateTime(event.createdAt)}</span>
					<span class="event-status status-${event.status}">${getStatusText(
				event.status
			)}</span>
				</div>
				<div class="queue-actions">
					${
						event.status === 'pending'
							? `
						<button class="approve-btn" onclick="approveEvent('${event.id}')">Одобрить</button>
						<button class="reject-btn" onclick="rejectEvent('${event.id}')">Отклонить</button>
					`
							: ''
					}
				</div>
			`
			list.appendChild(eventDiv)
		})
	} catch (error) {
		console.error('Ошибка при загрузке очереди:', error)
		alert('Не удалось загрузить очередь событий')
	}
}

async function approveEvent(id) {
	if (!isAdmin) return alert('Нет прав.')
	if (!confirm('Вы уверены, что хотите одобрить это событие?')) return

	try {
		const event = await db.approveEvent(id)
		await loadQueuedEvents()
		await loadEvents() // Refresh all events on the map
		await loadAdminEvents() // Added admin panel refresh

		// Принудительно обновляем данные для отслеживания изменений
		const events = await db.getAllEvents()
		window.lastEventsData = JSON.stringify(
			events.filter(e => e.status === 'approved')
		)
	} catch (error) {
		console.error('Ошибка при одобрении события:', error)
		alert('Не удалось одобрить событие')
	}
}

async function rejectEvent(id) {
	if (!isAdmin) return alert('Нет прав.')
	if (!confirm('Вы уверены, что хотите отклонить это событие?')) return

	const reason = ''

	try {
		await db.rejectEvent(id, reason)
		await loadQueuedEvents()
		alert('Событие отклонено.')
	} catch (error) {
		console.error('Ошибка при отклонении события:', error)
		alert('Не удалось отклонить событие')
	}
}

// Функция для отображения уведомления о том, что функция находится в разработке
function showLiveNewsNotification() {
	alert('Функция в разработке')
}

// Добавляем функцию для автоматического обновления
let pollInterval = null

function startAutoRefresh() {
	// Проверяем обновления каждые 10 секунд
	if (pollInterval) clearInterval(pollInterval)
	pollInterval = setInterval(async () => {
		try {
			const events = await db.getAllEvents()
			const currentEventsData = JSON.stringify(
				events.filter(e => e.status === 'approved')
			)

			// Проверяем, изменились ли данные
			if (window.lastEventsData !== currentEventsData) {
				await loadEvents()
				console.log('Events updated automatically')
			}
		} catch (error) {
			console.error('Error checking for updates:', error)
		}
	}, 10000) // 10 секунд
}

function stopAutoRefresh() {
	if (pollInterval) {
		clearInterval(pollInterval)
		pollInterval = null
	}
}

// Начинаем автоматическое обновление при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
	loadEvents()
	startAutoRefresh()
})
