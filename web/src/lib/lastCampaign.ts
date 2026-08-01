// Запоминание последней открытой кампании — чтобы на CampaignPicker можно
// было просто продолжить, не выбирая заново из списка.

const STORAGE_KEY = 'dnd-last-campaign'

export interface LastCampaign {
  id: string
  name: string
  role: 'gm' | 'player'
}

export function saveLastCampaign(campaign: LastCampaign) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(campaign))
}

export function getLastCampaign(): LastCampaign | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LastCampaign
    if (!parsed.id || !parsed.name || (parsed.role !== 'gm' && parsed.role !== 'player')) return null
    return parsed
  } catch {
    return null
  }
}

export function clearLastCampaign() {
  localStorage.removeItem(STORAGE_KEY)
}
