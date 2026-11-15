
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

function App() {
  const [showUpload, setShowUpload] = useState(false)
  const [title, setTitle] = useState('')
  const [player, setPlayer] = useState('Paolo Maldini')
  const [video, setVideo] = useState(null)
  const [videoPreview, setVideoPreview] = useState('')
  const [rules, setRules] = useState([false, false, false])
  const [clips, setClips] = useState([])
  const [viewedClips, setViewedClips] = useState([])
  const [search, setSearch] = useState('')
  const [playerFilter, setPlayerFilter] = useState('All Players')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingClips, setLoadingClips] = useState(true)
  const [likingClips, setLikingClips] = useState([])

  const allRulesAccepted = rules.every(Boolean)

  const players = [
    { name: 'Paolo Maldini', image: '/players/maldini.jpg', description: 'Defensive Legend' },
    { name: 'Cristiano Ronaldo', image: '/players/ronaldo.jpg', description: 'Legendary Goals' },
    { name: 'Neymar Jr', image: '/players/neymar.jpg', description: 'Skills & Tricks' },
    { name: 'Lionel Messi', image: '/players/messi.jpg', description: 'Football Genius' }
  ]

  // Videolar va Like ma'lumotlarini yuklash
  async function loadClips() {
    setLoadingClips(true)

    try {
      const { data: clipsData, error: clipsError } = await supabase
        .from('clips')
        .select('*')
        .order('created_at', { ascending: false })

      if (clipsError) throw clipsError

      const { data: likesData, error: likesError } = await supabase
        .from('clip_likes')
        .select('clip_id')

      if (likesError) throw likesError

      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user

      let myLikes = []

      if (user) {
        const { data, error } = await supabase
          .from('clip_likes')
          .select('clip_id')
          .eq('user_id', user.id)

        if (error) throw error

        myLikes = data.map(like => like.clip_id)
      }

      const likeCounts = {}

      likesData.forEach(like => {
        likeCounts[like.clip_id] =
          (likeCounts[like.clip_id] || 0) + 1
      })

      const updatedClips = (clipsData || []).map(clip => ({
        ...clip,
        likes_count: likeCounts[clip.id] || 0,
        liked_by_me: myLikes.includes(clip.id)
      }))

      setClips(updatedClips)
    } catch (error) {
      console.error(error)
      setMessage('Loading error: ' + error.message)
    } finally {
      setLoadingClips(false)
    }
  }

  useEffect(() => {
    loadClips()
  }, [])

  // Like bosish yoki Like'ni qaytarib olish
  async function toggleLike(clip) {
    if (likingClips.includes(clip.id)) return

    setLikingClips(previous => [...previous, clip.id])

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError) throw userError

      const user = userData.user

      if (!user) {
        throw new Error('Please login first.')
      }

      if (clip.liked_by_me) {
        const { error } = await supabase
          .from('clip_likes')
          .delete()
          .eq('clip_id', clip.id)
          .eq('user_id', user.id)

        if (error) throw error

        setClips(previous =>
          previous.map(item =>
            item.id === clip.id
              ? {
                  ...item,
                  likes_count: Math.max(0, item.likes_count - 1),
                  liked_by_me: false
                }
              : item
          )
        )
      } else {
        const { error } = await supabase
          .from('clip_likes')
          .insert({
            clip_id: clip.id,
            user_id: user.id
          })

        if (error) throw error

        setClips(previous =>
          previous.map(item =>
            item.id === clip.id
              ? {
                  ...item,
                  likes_count: item.likes_count + 1,
                  liked_by_me: true
                }
              : item
          )
        )
      }
    } catch (error) {
      console.error(error)
      setMessage('Like error: ' + error.message)
    } finally {
      setLikingClips(previous =>
        previous.filter(id => id !== clip.id)
      )
    }
  }

  function handleVideoChange(e) {
    const selectedVideo = e.target.files[0]
    if (!selectedVideo) return

    if (selectedVideo.size > 50 * 1024 * 1024) {
      setMessage('Video must be smaller than 50 MB.')
      e.target.value = ''
      return
    }

    if (videoPreview) URL.revokeObjectURL(videoPreview)

    setVideo(selectedVideo)
    setVideoPreview(URL.createObjectURL(selectedVideo))
    setMessage('')
  }

  function recordClipView(id) {
    setViewedClips(previous => {
      if (previous.includes(id)) return previous

      setClips(current =>
        current.map(clip =>
          clip.id === id
            ? { ...clip, views: (clip.views || 0) + 1 }
            : clip
        )
      )

      return [...previous, id]
    })
  }

  // Videoni Storage va Database'ga yuklash
  async function publishVideo(e) {
    e.preventDefault()

    if (!title.trim() || !video || !allRulesAccepted) return

    setUploading(true)
    setMessage('Uploading video...')

    let uploadedPath = null

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError) throw userError

      const user = userData.user
      if (!user) throw new Error('Please login first.')

      const safeName = video.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${user.id}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('clips')
        .upload(filePath, video, {
          cacheControl: '3600',
          upsert: false,
          contentType: video.type
        })

      if (uploadError) throw uploadError

      uploadedPath = filePath

      const { data: urlData } = supabase.storage
        .from('clips')
        .getPublicUrl(filePath)

      const { error: databaseError } = await supabase
        .from('clips')
        .insert({
          title: title.trim(),
          player,
          video_url: urlData.publicUrl,
          storage_path: filePath,
          user_id: user.id
        })

      if (databaseError) throw databaseError

      setMessage('Video uploaded successfully!')

      if (videoPreview) URL.revokeObjectURL(videoPreview)

      setTitle('')
      setVideo(null)
      setVideoPreview('')
      setRules([false, false, false])
      setShowUpload(false)

      await loadClips()
    } catch (error) {
      console.error(error)
      setMessage('Upload error: ' + error.message)

      if (uploadedPath) {
        await supabase.storage.from('clips').remove([uploadedPath])
      }
    } finally {
      setUploading(false)
    }
  }

  function closeUpload() {
    if (videoPreview) URL.revokeObjectURL(videoPreview)

    setVideo(null)
    setVideoPreview('')
    setRules([false, false, false])
    setMessage('')
    setShowUpload(false)
  }

  const filteredClips = clips.filter(clip => {
    const matchesSearch =
      clip.title.toLowerCase().includes(search.toLowerCase()) ||
      clip.player.toLowerCase().includes(search.toLowerCase())

    const matchesPlayer =
      playerFilter === 'All Players' || clip.player === playerFilter

    return matchesSearch && matchesPlayer
  })

  const trendingClips = [...clips]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 4)

  function selectPlayer(name) {
    setPlayerFilter(name)
    setSearch('')

    document.getElementById('latest-clips')?.scrollIntoView({
      behavior: 'smooth'
    })
  }

  // Video kartasi
  function renderClipCard(clip) {
    return (
      <div className="clip-card" key={clip.id}>
        <video
          src={clip.video_url}
          controls
          width="100%"
          onPlay={() => recordClipView(clip.id)}
        />

        <h3>{clip.title}</h3>
        <p>{clip.player}</p>
        <p>👁️ {clip.views || 0} views</p>

        <button
          type="button"
          className="like-btn"
          onClick={() => toggleLike(clip)}
          disabled={likingClips.includes(clip.id)}
          aria-pressed={clip.liked_by_me}
          style={{
            marginTop: '10px',
            padding: '9px 15px',
            borderRadius: '8px',
            border: '1px solid #444',
            background: clip.liked_by_me ? '#35151b' : '#171c19',
            color: clip.liked_by_me ? '#ff5268' : '#ffffff',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          {clip.liked_by_me ? '❤️' : '🤍'} {clip.likes_count || 0} Likes
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="navbar">
        <h1>STARIX<span>CLIPS</span></h1>

        <div className="nav-links">
          <a href="#">Home</a>
          <a href="#players">Players</a>
          <a href="#trending-clips">Trending</a>
        </div>

        <input
          className="search-input"
          type="text"
          placeholder="Search clips or players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select
          className="player-filter"
          value={playerFilter}
          onChange={e => setPlayerFilter(e.target.value)}
        >
          <option>All Players</option>
          {players.map(item => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>

        <button className="upload-btn" onClick={() => setShowUpload(true)}>
          + Upload
        </button>
      </nav>

      <main>
        <section className="hero">
          <p className="tag">FOOTBALL COMMUNITY</p>
          <h2>
            YOUR FOOTBALL.<br />
            YOUR <span>MOMENTS.</span>
          </h2>
          <p>Discover and share the best football moments.</p>
          <button onClick={() => setShowUpload(true)}>Explore Clips</button>
        </section>

        <section className="clips" id="players">
          <h2>Legendary Players</h2>

          <div className="clip-grid">
            {players.map(item => (
              <div
                className="clip-card player-card"
                key={item.name}
                onClick={() => selectPlayer(item.name)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectPlayer(item.name)
                  }
                }}
              >
                <img src={item.image} alt={item.name} />
                <h3>{item.name}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="clips" id="latest-clips">
          <h2>Latest Clips</h2>

          {loadingClips ? (
            <p>Loading videos...</p>
          ) : filteredClips.length > 0 ? (
            <div className="clip-grid">
              {filteredClips.map(clip => renderClipCard(clip))}
            </div>
          ) : (
            <p className="empty-message">
              {search || playerFilter !== 'All Players'
                ? 'No clips found. Try another filter.'
                : 'No clips uploaded yet. Be the first!'}
            </p>
          )}
        </section>

        <section className="clips" id="trending-clips">
          <h2>🔥 Trending Clips</h2>

          {trendingClips.length > 0 ? (
            <div className="clip-grid">
              {trendingClips.map(clip => renderClipCard(clip))}
            </div>
          ) : (
            <p className="empty-message">
              No trending clips yet. Upload your first video!
            </p>
          )}
        </section>
      </main>

      {showUpload && (
        <div className="upload-overlay">
          <form className="upload-form" onSubmit={publishVideo}>
            <button
              type="button"
              className="close-btn"
              onClick={closeUpload}
            >
              ✕
            </button>

            <h2>Upload Your Clip</h2>

            <label>Video title</label>
            <input
              type="text"
              placeholder="Enter video title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />

            <label>Select player</label>
            <select
              value={player}
              onChange={e => setPlayer(e.target.value)}
            >
              {players.map(item => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>

            <label>Select video</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
              required
            />

            {videoPreview && (
              <div className="video-preview">
                <video src={videoPreview} controls width="100%" />
                <p>Video preview</p>
              </div>
            )}

            <h3>Upload Rules</h3>

            {[
              'My video contains no watermark.',
              'I have permission to upload this content.',
              'My video follows Starix Clips rules.'
            ].map((rule, index) => (
              <label className="rule" key={index}>
                <input
                  type="checkbox"
                  checked={rules[index]}
                  onChange={e => {
                    const updatedRules = [...rules]
                    updatedRules[index] = e.target.checked
                    setRules(updatedRules)
                  }}
                />
                {rule}
              </label>
            ))}

            {message && <p>{message}</p>}

            <button
              className="publish-btn"
              type="submit"
              disabled={
                uploading || !title.trim() || !video || !allRulesAccepted
              }
            >
              {uploading ? 'Uploading...' : 'Publish Clip'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default App
