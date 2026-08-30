interface Assignee {
  id:         number
  first_name: string
  last_name:  string
}

interface Props {
  assignees: Assignee[]
  max?:      number
  size?:     number
}

function initials(a: Assignee): string {
  return (a.first_name[0] ?? '') + (a.last_name[0] ?? '')
}

// Deterministic hue from id so the same user always gets the same color.
function avatarBg(id: number): string {
  const hues = [196, 152, 262, 32, 344, 88, 220]
  const h = hues[id % hues.length] ?? 196
  return `hsl(${h} 55% 48%)`
}

export default function AssigneeAvatarStack({ assignees, max = 3, size = 24 }: Props) {
  if (assignees.length === 0) return null

  const visible  = assignees.slice(0, max)
  const overflow = assignees.length - visible.length

  return (
    <div className="flex items-center" style={{ marginLeft: 0 }}>
      {visible.map((a, i) => (
        <span
          key={a.id}
          title={`${a.first_name} ${a.last_name}`}
          style={{
            width:           size,
            height:          size,
            borderRadius:    '50%',
            border:          '2px solid white',
            background:      avatarBg(a.id),
            marginLeft:      i === 0 ? 0 : -6,
            display:         'inline-flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        size * 0.38,
            fontWeight:      600,
            color:           'white',
            textTransform:   'uppercase',
            flexShrink:      0,
            zIndex:          visible.length - i,
            position:        'relative',
          }}
        >
          {initials(a)}
        </span>
      ))}

      {overflow > 0 && (
        <span
          style={{
            width:           size,
            height:          size,
            borderRadius:    '50%',
            border:          '2px solid white',
            background:      '#94a3b8',
            marginLeft:      -6,
            display:         'inline-flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        size * 0.36,
            fontWeight:      600,
            color:           'white',
            flexShrink:      0,
            position:        'relative',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
