<?php
/**
 * The footer for the OFF PRODUCT theme.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
	<footer class="site-footer wrap" id="contact">
		<div class="card footer-card" data-reveal>
			<div class="kicker mono">06 / CONTACT</div>
			<h2><?php echo off_product_richtext( get_theme_mod( 'contact_heading', "次に育てる価値について、\nまずはお話ししませんか。" ) ); ?></h2>
			<a class="cta-btn" style="margin:0 auto;" href="<?php echo esc_url( get_theme_mod( 'contact_button_url', 'mailto:info@example.com' ) ); ?>">
				<?php echo esc_html( get_theme_mod( 'contact_button_text', 'お問い合わせはこちら' ) ); ?> →
			</a>
		</div>
		<div class="foot-bottom">
			<span>© <?php echo esc_html( date_i18n( 'Y' ) ); ?> <?php echo esc_html( get_theme_mod( 'company_name', '株式会社OFF PRODUCT' ) ); ?></span>
			<span>APP DEVELOPMENT STUDIO</span>
		</div>
	</footer>

<?php wp_footer(); ?>
</body>
</html>
