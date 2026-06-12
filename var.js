(function(){
  const detail = {
    arp_tier:            window.arp_tier            || 0,
    arp_balance:         window.arp_balance         || 0,
    arp_lifetime:        window.arp_lifetime        || 0,
    has_epsilon_rewards: window.has_epsilon_rewards || false,
    epsilon_balance:     window.epsilon_balance     || 0,
    bonusCalendarArp:    window.bonusCalendarArp    || 0,
    artifactLangDiscount:window.artifactLangDiscount|| 0,
    fragment_balance:    window.fragment_balance    || 0,
    arpMultiplier:       window.arpMultiplier       || 1,
    monthly_logins:      window.monthly_logins      || {},
    consecutive_logins:  window.consecutive_logins  || {}
  };
  document.dispatchEvent(new CustomEvent('AWA_GLOBALS_READY', { detail }));
})();