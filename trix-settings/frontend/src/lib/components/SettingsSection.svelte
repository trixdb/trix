<script lang="ts">
  export let title: string;
</script>

<section class="settings-section">
  <h3>{title}</h3>
  <div class="section-content">
    <slot />
  </div>
</section>

<style>
  .settings-section {
    margin-bottom: 32px;
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
