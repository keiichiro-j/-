<?php
/**
 * Custom post type: works (開発実績・プロダクト)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function off_product_register_works_cpt() {
	register_post_type( 'works', array(
		'labels' => array(
			'name'               => '実績（Works）',
			'singular_name'      => '実績',
			'add_new_item'       => '実績を追加',
			'edit_item'          => '実績を編集',
			'all_items'          => 'すべての実績',
			'menu_name'          => '実績（Works）',
		),
		'public'       => true,
		'has_archive'  => true,
		'rewrite'      => array( 'slug' => 'works' ),
		'menu_icon'    => 'dashicons-hammer',
		'supports'     => array( 'title', 'editor', 'excerpt', 'thumbnail' ),
		'show_in_rest' => true,
	) );
}
add_action( 'init', 'off_product_register_works_cpt' );

/**
 * Status meta box (開発中 / 企画中 / 公開中).
 */
function off_product_works_status_options() {
	return array(
		'planning'  => '企画中',
		'building'  => '開発中',
		'live'      => '公開中',
	);
}

function off_product_add_works_meta_box() {
	add_meta_box(
		'off_product_works_status',
		'進行状況',
		'off_product_render_works_meta_box',
		'works',
		'side',
		'default'
	);
}
add_action( 'add_meta_boxes', 'off_product_add_works_meta_box' );

function off_product_render_works_meta_box( $post ) {
	wp_nonce_field( 'off_product_works_save', 'off_product_works_nonce' );
	$status  = get_post_meta( $post->ID, '_off_product_status', true );
	$options = off_product_works_status_options();
	if ( ! $status ) {
		$status = 'planning';
	}
	echo '<select name="off_product_status" style="width:100%">';
	foreach ( $options as $value => $label ) {
		printf(
			'<option value="%s" %s>%s</option>',
			esc_attr( $value ),
			selected( $status, $value, false ),
			esc_html( $label )
		);
	}
	echo '</select>';
}

function off_product_save_works_meta( $post_id ) {
	if ( ! isset( $_POST['off_product_works_nonce'] ) ||
		! wp_verify_nonce( $_POST['off_product_works_nonce'], 'off_product_works_save' ) ) {
		return;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	if ( isset( $_POST['off_product_status'] ) ) {
		$allowed = array_keys( off_product_works_status_options() );
		$value   = sanitize_text_field( $_POST['off_product_status'] );
		if ( in_array( $value, $allowed, true ) ) {
			update_post_meta( $post_id, '_off_product_status', $value );
		}
	}
}
add_action( 'save_post_works', 'off_product_save_works_meta' );

/**
 * Helper: render a status badge for a works post.
 */
function off_product_works_status_badge( $post_id ) {
	$options = off_product_works_status_options();
	$status  = get_post_meta( $post_id, '_off_product_status', true );
	if ( ! $status || ! isset( $options[ $status ] ) ) {
		$status = 'planning';
	}
	$is_live = 'live' === $status;
	printf(
		'<span class="status-badge%s"><span class="dot"></span>%s</span>',
		$is_live ? ' is-live' : '',
		esc_html( $options[ $status ] )
	);
}
