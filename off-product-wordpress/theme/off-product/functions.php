<?php
/**
 * OFF PRODUCT theme bootstrap.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OFF_PRODUCT_VERSION', '1.0.0' );

/**
 * Theme setup.
 */
function off_product_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo', array(
		'height'      => 48,
		'width'       => 160,
		'flex-height' => true,
		'flex-width'  => true,
	) );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'script', 'style' ) );
	add_theme_support( 'automatic-feed-links' );

	register_nav_menus( array(
		'primary' => __( 'メインナビゲーション', 'off-product' ),
	) );
}
add_action( 'after_setup_theme', 'off_product_setup' );

/**
 * Enqueue styles and scripts.
 */
function off_product_assets() {
	wp_enqueue_style(
		'off-product-fonts',
		'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500;700&display=swap',
		array(),
		null
	);

	wp_enqueue_style( 'off-product-style', get_stylesheet_uri(), array(), OFF_PRODUCT_VERSION );

	wp_enqueue_script(
		'off-product-main',
		get_template_directory_uri() . '/assets/js/main.js',
		array(),
		OFF_PRODUCT_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'off_product_assets' );

/**
 * Fallback menu when no menu is assigned to the primary location.
 */
function off_product_fallback_menu() {
	echo '<ul class="nav-links">';
	$links = array(
		'#service' => '事業内容',
		'#works'   => '実績',
		'#process' => '開発の流れ',
		'#company' => '会社概要',
	);
	foreach ( $links as $href => $label ) {
		printf( '<li><a href="%s">%s</a></li>', esc_url( $href ), esc_html( $label ) );
	}
	echo '</ul>';
}

require get_template_directory() . '/inc/cpt-works.php';
require get_template_directory() . '/inc/customizer.php';
