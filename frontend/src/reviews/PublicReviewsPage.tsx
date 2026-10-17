import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import type { ReviewCatalogType, ReviewList } from '../types/supabase'
import '../pages/library.css'

const reviewCatalogTypes: ReviewCatalogType[] = ['books', 'movies', 'board-games']

function titleFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('title' in state)) return null
  return typeof state.title === 'string' ? state.title : null
}

export function PublicReviewsPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const { catalogType: rawCatalogType, itemId: rawItemId } = useParams()
  const location = useLocation()
  const [data, setData] = useState<ReviewList | null>(null)
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const [failedKey, setFailedKey] = useState('')
  const catalogType = reviewCatalogTypes.find((value) => value === rawCatalogType)
  const itemId = Number(rawItemId)
  const requestKey = `${rawCatalogType ?? ''}:${rawItemId ?? ''}`
  const title = titleFromState(location.state) ?? `${t('reviews')} #${rawItemId ?? ''}`
  const accessToken = session?.access_token
  const invalidRequest = !accessToken || !catalogType || !Number.isInteger(itemId) || itemId < 1

  useEffect(() => {
    if (!accessToken || !catalogType || !Number.isInteger(itemId) || itemId < 1) return
    let cancelled = false
    void fetch(`/api/reviews/${catalogType}/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (response) => {
      if (!response.ok) throw new Error(t('reviewLoadError'))
      return response.json() as Promise<ReviewList>
    }).then((result) => {
      if (!cancelled) {
        setData(result)
        setLoadedKey(requestKey)
      }
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : t('reviewLoadError'))
        setFailedKey(requestKey)
      }
    })
    return () => { cancelled = true }
  }, [accessToken, catalogType, itemId, requestKey, t])

  const publicReviews = data?.reviews.filter((review) => review.is_public) ?? []

  return (
    <section className="public-reviews-page" aria-labelledby="public-reviews-title">
      <Link className="button button-light public-reviews-back" to="/library">← {t('library')}</Link>
      <header>
        <p className="eyebrow">{t('reviews')}</p>
        <h1 id="public-reviews-title">{title}</h1>
      </header>
      {loadedKey === requestKey && data?.average_rating !== null && data?.average_rating !== undefined && (
        <p className="review-average">{t('reviewAverage')}: {data.average_rating.toFixed(1)} / 10</p>
      )}
      {invalidRequest || failedKey === requestKey ? <p className="library-error" role="alert">{invalidRequest ? t('reviewLoadError') : error}</p> : loadedKey !== requestKey ? <p role="status">{t('loading')}</p> : publicReviews.length === 0 ? (
        <p className="library-empty">{t('reviewNone')}</p>
      ) : (
        <section className="review-list public-review-list" aria-label={t('reviews')}>
          {publicReviews.map((review) => (
            <article className="review-entry" key={review.id}>
              <header>
                <strong>{review.reviewer_name}</strong>
                {review.rating !== null && <span>{review.rating} / 10</span>}
              </header>
              {review.body && <p>{review.body}</p>}
            </article>
          ))}
        </section>
      )}
    </section>
  )
}
