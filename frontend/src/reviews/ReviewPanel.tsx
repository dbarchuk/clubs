import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n-context'
import type { ReviewCatalogType, ReviewList } from '../types/supabase'

interface ReviewPanelProps {
  catalogType: ReviewCatalogType
  itemId: number
  title: string
  accessToken: string
  onClose: () => void
}

async function getError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'detail' in payload && typeof payload.detail === 'string') {
      return payload.detail
    }
  } catch {
    return fallback
  }
  return fallback
}

export function ReviewPanel({ catalogType, itemId, title, accessToken, onClose }: ReviewPanelProps) {
  const { t } = useI18n()
  const [data, setData] = useState<ReviewList | null>(null)
  const [rating, setRating] = useState('')
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/reviews/${catalogType}/${itemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getError(response, t('reviewLoadError')))
      const result = await response.json() as ReviewList
      setData(result)
      const ownReview = result.reviews.find((review) => review.is_mine)
      setRating(ownReview?.rating === null || ownReview?.rating === undefined ? '' : String(ownReview.rating))
      setBody(ownReview?.body ?? '')
      setIsPublic(ownReview?.is_public ?? false)
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t('reviewLoadError'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, catalogType, itemId, t])

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/reviews/${catalogType}/${itemId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating ? Number(rating) : null, body: body.trim() || null, is_public: isPublic }),
      })
      if (!response.ok) throw new Error(await getError(response, t('reviewSaveError')))
      await loadReviews()
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : t('reviewSaveError'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteReview() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/reviews/${catalogType}/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getError(response, t('reviewDeleteError')))
      await loadReviews()
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : t('reviewDeleteError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="library-editor-backdrop" onClick={onClose}>
      <section className="library-editor review-panel" role="dialog" aria-modal="true" aria-labelledby="review-panel-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="review-panel-title">{t('reviews')}: {title}</h2>
        {data?.average_rating !== null && data?.average_rating !== undefined && <p className="review-average">{t('reviewAverage')}: {data.average_rating.toFixed(1)} / 10</p>}
        {loading ? <p role="status">{t('loading')}</p> : data ? <>
          <section className="review-list" aria-label={t('reviews')}>
            {data?.reviews.length ? data.reviews.map((review) => (
              <article className="review-entry" key={review.id}>
                <header><strong>{review.reviewer_name}</strong>{review.rating !== null && <span>{review.rating} / 10</span>}</header>
                {review.body && <p>{review.body}</p>}
                {review.is_mine && <small>{review.is_public ? t('reviewPublic') : t('reviewPrivate')}</small>}
              </article>
            )) : <p>{t('reviewNone')}</p>}
          </section>
          <form className="review-form" onSubmit={(event) => { void saveReview(event) }}>
            <h3>{t('yourReview')}</h3>
            <label>{t('reviewRating')}
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                <option value="">{t('reviewNoRating')}</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>{t('reviewText')}<textarea maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
            <label className="review-public-toggle"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />{t('reviewMakePublic')}</label>
            <p className="review-privacy-help">{t('reviewPrivacyHelp')}</p>
            {error && <p className="library-error" role="alert">{error}</p>}
            <div className="library-editor-actions">
              {data?.reviews.some((review) => review.is_mine) && <button className="button button-light" type="button" disabled={saving} onClick={() => void deleteReview()}>{t('deleteReview')}</button>}
              <button className="button button-light" type="button" disabled={saving} onClick={onClose}>{t('cancel')}</button>
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('saveReview')}</button>
            </div>
          </form>
        </> : <p className="library-error" role="alert">{error || t('reviewLoadError')}</p>}
      </section>
    </div>
  )
}
