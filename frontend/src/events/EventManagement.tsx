import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n-context'
import type { EventRecord } from '../types/supabase'
import './events.css'

interface EventManagementProps {
  clubId: string
  accessToken: string
  canManage: boolean
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') return body.detail
  } catch {
    return fallback
  }
  return fallback
}

export function EventManagement({ clubId, accessToken, canManage }: EventManagementProps) {
  const { t } = useI18n()
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [linkedItemId, setLinkedItemId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const loadEvents = useCallback(async () => {
    const response = await fetch(`/api/events/clubs/${clubId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(await errorMessage(response, t('eventsLoadError')))
    setEvents((await response.json()) as EventRecord[])
  }, [accessToken, clubId, t])

  useEffect(() => {
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Event state is updated after the API response.
    void loadEvents().catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('eventsLoadError'))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadEvents, t])

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/events/clubs/${clubId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: title.trim() || null,
          linked_item_id: linkedItemId.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          start_date: startDate,
          end_date: endDate,
          start_time: startTime || null,
          end_time: endTime || null,
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('eventSaveError')))
      setTitle('')
      setLinkedItemId('')
      setAvatarUrl('')
      setStartDate('')
      setEndDate('')
      setStartTime('')
      setEndTime('')
      await loadEvents()
      setNotice(t('eventCreated'))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('eventSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (record: EventRecord, nextStatus: EventRecord['status']) => {
    setError('')
    try {
      const response = await fetch(`/api/events/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('eventUpdateError')))
      await loadEvents()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('eventUpdateError'))
    }
  }

  const removeEvent = async (record: EventRecord) => {
    if (!window.confirm(t('confirmDeleteEvent'))) return
    setError('')
    try {
      const response = await fetch(`/api/events/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) throw new Error(await errorMessage(response, t('eventDeleteError')))
      await loadEvents()
      setNotice(t('eventDeleted'))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('eventDeleteError'))
    }
  }

  return (
    <section className="event-management" aria-labelledby="club-events-title">
      <header><p>{t('eventsEyebrow')}</p><h2 id="club-events-title">{t('clubEvents')}</h2></header>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="club-form-error" role="alert">{error}</p>}
      {canManage && (
        <form className="club-create-form" onSubmit={(event) => void createEvent(event)}>
          <h3>{t('createEvent')}</h3>
          <label className="club-form-field"><span>{t('eventTitle')}</span><input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="club-form-field"><span>{t('linkedItemId')}</span><input value={linkedItemId} onChange={(event) => setLinkedItemId(event.target.value)} /></label>
          <label className="club-form-field"><span>{t('eventAvatarUrl')}</span><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>
          <div className="event-date-fields">
            <label className="club-form-field"><span>{t('startDate')}</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="club-form-field"><span>{t('endDate')}</span><input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            <label className="club-form-field"><span>{t('startTime')}</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label className="club-form-field"><span>{t('endTime')}</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
          </div>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('createEvent')}</button>
        </form>
      )}
      {loading ? <p role="status">{t('loading')}</p> : events.length === 0 ? <p>{t('noEvents')}</p> : (
        <ul className="event-list">
          {events.map((record) => (
            <li className="event-card" key={record.id}>
              {record.avatar_url && <img src={record.avatar_url} alt="" />}
              <div className="event-card-content">
                <h3>{record.title || t('clubEvent')}</h3>
                <p>{record.start_date}{record.end_date !== record.start_date ? ` – ${record.end_date}` : ''}{record.start_time ? ` · ${record.start_time.slice(0, 5)}–${record.end_time?.slice(0, 5) ?? ''}` : ` · ${t('allDay')}`}</p>
                <span className={`event-status event-status-${record.status}`}>{t(`eventStatus_${record.status}`)}</span>
              </div>
              {canManage && <div className="event-card-actions">
                <label><span className="visually-hidden">{t('eventStatus')}</span><select value={record.status} onChange={(event) => void updateStatus(record, event.target.value as EventRecord['status'])}>
                  <option value="scheduled">{t('eventStatus_scheduled')}</option><option value="delayed">{t('eventStatus_delayed')}</option><option value="cancelled">{t('eventStatus_cancelled')}</option><option value="held">{t('eventStatus_held')}</option>
                </select></label>
                <button className="button button-light" type="button" onClick={() => void removeEvent(record)}>{t('deleteEvent')}</button>
              </div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
