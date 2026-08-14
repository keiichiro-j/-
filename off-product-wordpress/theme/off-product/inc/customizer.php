<?php
/**
 * Theme Customizer: editable copy without touching template code.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function off_product_customize_register( $wp_customize ) {

	/* ---------------------------------------------------------------
	 * Hero
	 * ------------------------------------------------------------- */
	$wp_customize->add_section( 'off_product_hero', array(
		'title'    => 'ヒーローエリア',
		'priority' => 30,
	) );

	$wp_customize->add_setting( 'hero_heading', array(
		'default'           => "アイデアを、\n迷わず使える{{grad}}プロダクト{{/grad}}へ。",
		'sanitize_callback' => 'wp_kses_post',
	) );
	$wp_customize->add_control( 'hero_heading', array(
		'label'       => '見出し（改行は \n、色を変える範囲は {{grad}}〜{{/grad}} で囲む）',
		'section'     => 'off_product_hero',
		'type'        => 'textarea',
	) );

	$wp_customize->add_setting( 'hero_text', array(
		'default'           => '株式会社OFF PRODUCTは、企画から開発・運用まで一貫して手がけるアプリ開発スタジオです。「かたちのない価値を、育てていく。」を合言葉に、ひとつのプロダクトにとどまらず、これから育つ事業を見据えてサービスを設計しています。',
		'sanitize_callback' => 'sanitize_textarea_field',
	) );
	$wp_customize->add_control( 'hero_text', array(
		'label'   => 'リード文',
		'section' => 'off_product_hero',
		'type'    => 'textarea',
	) );

	$wp_customize->add_setting( 'hero_cta_text', array(
		'default'           => 'プロジェクトを相談する',
		'sanitize_callback' => 'sanitize_text_field',
	) );
	$wp_customize->add_control( 'hero_cta_text', array(
		'label'   => 'ヒーローCTAボタンのラベル',
		'section' => 'off_product_hero',
		'type'    => 'text',
	) );

	$wp_customize->add_setting( 'hero_cta_url', array(
		'default'           => '#contact',
		'sanitize_callback' => 'esc_url_raw',
	) );
	$wp_customize->add_control( 'hero_cta_url', array(
		'label'   => 'ヒーローCTAボタンのリンク先',
		'section' => 'off_product_hero',
		'type'    => 'text',
	) );

	/* ---------------------------------------------------------------
	 * Philosophy band
	 * ------------------------------------------------------------- */
	$wp_customize->add_section( 'off_product_philosophy', array(
		'title'    => 'フィロソフィー',
		'priority' => 32,
	) );

	$wp_customize->add_setting( 'philosophy_heading', array(
		'default'           => "「PRODUCT」を{{grad}}「OFF」{{/grad}}にする。\nモノではなく、\n価値を届ける会社です。",
		'sanitize_callback' => 'wp_kses_post',
	) );
	$wp_customize->add_control( 'philosophy_heading', array(
		'label'   => '見出し（改行は \n、色を変える範囲は {{grad}}〜{{/grad}}）',
		'section' => 'off_product_philosophy',
		'type'    => 'textarea',
	) );

	$wp_customize->add_setting( 'philosophy_text', array(
		'default'           => '社名の由来は、「PRODUCT（モノ）」にこだわらず、サービス・価値を提供し続けるという思いから。地下で根を張り、目に見えないところで育ちながら新しい芽を出し続ける「地下茎」のように、ひとつの製品に縛られず、必要な時に新しい事業として芽吹いていきます。',
		'sanitize_callback' => 'sanitize_textarea_field',
	) );
	$wp_customize->add_control( 'philosophy_text', array(
		'label'   => '本文',
		'section' => 'off_product_philosophy',
		'type'    => 'textarea',
	) );

	/* ---------------------------------------------------------------
	 * Company
	 * ------------------------------------------------------------- */
	$wp_customize->add_section( 'off_product_company', array(
		'title'    => '会社概要',
		'priority' => 34,
	) );

	$company_fields = array(
		'company_name'     => array( '会社名', '株式会社OFF PRODUCT' ),
		'company_business' => array( '事業内容', 'アプリ開発（今後、他事業への展開を予定）' ),
		'company_founded'  => array( '設立', '' ),
		'company_address'  => array( '所在地', '' ),
		'company_ceo'      => array( '代表者', '' ),
	);
	foreach ( $company_fields as $id => $conf ) {
		$wp_customize->add_setting( $id, array(
			'default'           => $conf[1],
			'sanitize_callback' => 'sanitize_text_field',
		) );
		$wp_customize->add_control( $id, array(
			'label'   => $conf[0],
			'section' => 'off_product_company',
			'type'    => 'text',
		) );
	}

	/* ---------------------------------------------------------------
	 * Contact
	 * ------------------------------------------------------------- */
	$wp_customize->add_section( 'off_product_contact', array(
		'title'    => 'お問い合わせ',
		'priority' => 36,
	) );

	$wp_customize->add_setting( 'contact_heading', array(
		'default'           => "次に育てる価値について、\nまずはお話ししませんか。",
		'sanitize_callback' => 'sanitize_textarea_field',
	) );
	$wp_customize->add_control( 'contact_heading', array(
		'label'   => '見出し（改行は \n）',
		'section' => 'off_product_contact',
		'type'    => 'textarea',
	) );

	$wp_customize->add_setting( 'contact_button_text', array(
		'default'           => 'お問い合わせはこちら',
		'sanitize_callback' => 'sanitize_text_field',
	) );
	$wp_customize->add_control( 'contact_button_text', array(
		'label'   => 'ボタンのラベル',
		'section' => 'off_product_contact',
		'type'    => 'text',
	) );

	$wp_customize->add_setting( 'contact_button_url', array(
		'default'           => 'mailto:info@example.com',
		'sanitize_callback' => 'esc_url_raw',
	) );
	$wp_customize->add_control( 'contact_button_url', array(
		'label'   => 'ボタンのリンク先（フォームURL または mailto:）',
		'section' => 'off_product_contact',
		'type'    => 'text',
	) );
}
add_action( 'customize_register', 'off_product_customize_register' );

/**
 * Convert "\n" to <br> and {{grad}}...{{/grad}} to a gradient span.
 */
function off_product_richtext( $text ) {
	$text = esc_html( $text );
	$text = str_replace( array( '{{grad}}', '{{/grad}}' ), array( '<span class="grad-text">', '</span>' ), $text );
	$text = nl2br( $text );
	return $text;
}
