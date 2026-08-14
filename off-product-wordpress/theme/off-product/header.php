<?php
/**
 * The header for the OFF PRODUCT theme.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header class="site-header">
	<nav class="nav">
		<?php if ( has_custom_logo() ) : ?>
			<div class="site-logo"><?php the_custom_logo(); ?></div>
		<?php else : ?>
			<a class="site-logo" href="<?php echo esc_url( home_url( '/' ) ); ?>">
				<span class="mark"></span><?php bloginfo( 'name' ); ?>
			</a>
		<?php endif; ?>

		<?php
		if ( has_nav_menu( 'primary' ) ) {
			wp_nav_menu( array(
				'theme_location' => 'primary',
				'container'      => false,
				'items_wrap'     => '<ul class="nav-links">%3$s</ul>',
			) );
		} else {
			off_product_fallback_menu();
		}
		?>

		<a class="nav-cta" href="#contact">お問い合わせ</a>

		<button class="hamburger" id="off-product-hamburger" aria-expanded="false" aria-controls="off-product-mobile-menu" aria-label="メニューを開く">
			<span></span><span></span><span></span>
		</button>
	</nav>

	<div class="mobile-menu" id="off-product-mobile-menu">
		<?php
		if ( has_nav_menu( 'primary' ) ) {
			wp_nav_menu( array(
				'theme_location' => 'primary',
				'container'      => false,
			) );
		} else {
			echo '<ul>';
			$links = array(
				'#service' => '事業内容',
				'#works'   => '実績',
				'#process' => '開発の流れ',
				'#company' => '会社概要',
				'#contact' => 'お問い合わせ',
			);
			foreach ( $links as $href => $label ) {
				printf( '<li><a href="%s">%s</a></li>', esc_url( $href ), esc_html( $label ) );
			}
			echo '</ul>';
		}
		?>
	</div>
</header>
