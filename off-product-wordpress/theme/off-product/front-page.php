<?php
/**
 * Front page: OFF PRODUCT corporate site.
 *
 * Assembles the hero (rhizome diagram), philosophy band, service,
 * works, process, company and contact sections. Copy is editable via
 * the Customizer (see inc/customizer.php); structural content (service
 * cards, process steps) lives here and can be edited directly.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>

<section class="hero wrap">
	<div class="eyebrow"><span class="dot"></span>APP DEVELOPMENT STUDIO</div>

	<div class="hero-grid">
		<div class="card hero-main" data-reveal>
			<h1><?php echo off_product_richtext( get_theme_mod( 'hero_heading', "アイデアを、\n迷わず使える{{grad}}プロダクト{{/grad}}へ。" ) ); ?></h1>
			<p><?php echo esc_html( get_theme_mod( 'hero_text', '株式会社OFF PRODUCTは、企画から開発・運用まで一貫して手がけるアプリ開発スタジオです。' ) ); ?></p>
			<a class="cta-btn" href="<?php echo esc_url( get_theme_mod( 'hero_cta_url', '#contact' ) ); ?>">
				<?php echo esc_html( get_theme_mod( 'hero_cta_text', 'プロジェクトを相談する' ) ); ?> →
			</a>
			<div class="hero-tags mono">
				<span>iOS</span><span>Web App</span><span>GAS</span>
			</div>
		</div>

		<div class="card hero-diagram" data-reveal>
			<div class="diagram-label mono">
				<span>RHIZOME STRUCTURE</span>
				<span>事業の育ち方</span>
			</div>
			<svg class="rhizome-svg" viewBox="0 0 320 420" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<path class="rhizome-path grown" d="M40,400 C60,340 38,286 90,252 C128,228 108,182 150,152 C176,134 168,92 168,58" />
				<path class="rhizome-path" d="M90,252 C150,244 196,238 250,224" />
				<path class="rhizome-path" d="M150,152 C196,140 232,128 262,112" />
				<path class="rhizome-path" d="M110,190 C78,176 54,160 34,138" />

				<g class="node-live">
					<circle class="pulse" cx="168" cy="58" r="9" />
					<circle cx="168" cy="58" r="7" />
					<text x="180" y="61">APP開発</text>
				</g>
				<g class="node-next">
					<circle cx="250" cy="224" r="6" />
					<text x="260" y="228">NEXT</text>
				</g>
				<g class="node-next">
					<circle cx="262" cy="112" r="6" />
					<text x="272" y="116">NEXT</text>
				</g>
				<g class="node-next">
					<circle cx="34" cy="138" r="6" />
					<text x="-6" y="128" text-anchor="end">NEXT</text>
				</g>
			</svg>
		</div>
	</div>
</section>

<section class="philosophy">
	<div class="wrap" data-reveal>
		<div class="kicker mono">PHILOSOPHY</div>
		<h2><?php echo off_product_richtext( get_theme_mod( 'philosophy_heading', "「PRODUCT」を{{grad}}「OFF」{{/grad}}にする。\nモノではなく、\n価値を届ける会社です。" ) ); ?></h2>
		<p><?php echo esc_html( get_theme_mod( 'philosophy_text', '社名の由来は、「PRODUCT（モノ）」にこだわらず、サービス・価値を提供し続けるという思いから。' ) ); ?></p>
	</div>
</section>

<section id="service" class="wrap">
	<div class="section-head" data-reveal>
		<div>
			<div class="kicker">01 / SERVICE</div>
			<h2>事業内容</h2>
		</div>
		<div class="desc">企画・設計から開発、リリース後の運用まで一貫してサポートします。</div>
	</div>
	<div class="service-grid">
		<div class="card service-card" data-reveal>
			<div class="icon">iOS</div>
			<h3>iOSアプリ開発</h3>
			<p>Swift / SwiftUIによるネイティブアプリ開発。App Store配信までワンストップで対応します。</p>
		</div>
		<div class="card service-card" data-reveal>
			<div class="icon">Web</div>
			<h3>Webアプリ開発</h3>
			<p>ブラウザやショートカットから利用できる軽量なWebアプリを、目的に合わせて設計します。</p>
		</div>
		<div class="card service-card" data-reveal>
			<div class="icon">GAS</div>
			<h3>業務システム開発</h3>
			<p>GAS・スプレッドシートを活用し、日々の業務を効率化する社内システムを構築します。</p>
		</div>
		<div class="card service-card" data-reveal>
			<div class="icon">⟲</div>
			<h3>運用・保守</h3>
			<p>リリース後も、改善提案や不具合対応を継続的に行い、長く使えるプロダクトを目指します。</p>
		</div>
	</div>

	<div class="next-verticals" data-reveal>
		<span class="sub-kicker mono">02 / NEXT VERTICALS — 今後参入予定の事業</span>
		<div class="slot-grid">
			<div class="work-slot"><div class="plus">＋</div><span class="label mono">VERTICAL — 準備中</span></div>
			<div class="work-slot"><div class="plus">＋</div><span class="label mono">VERTICAL — 準備中</span></div>
			<div class="work-slot"><div class="plus">＋</div><span class="label mono">VERTICAL — 準備中</span></div>
		</div>
	</div>
</section>

<section id="works" class="wrap">
	<div class="section-head" data-reveal>
		<div>
			<div class="kicker">03 / WORKS</div>
			<h2>開発実績・プロダクト</h2>
		</div>
		<div class="desc">自社開発プロダクトを中心にご紹介します。</div>
	</div>

	<?php
	$works_query = new WP_Query( array(
		'post_type'      => 'works',
		'posts_per_page' => 6,
		'post_status'    => 'publish',
	) );
	?>

	<?php if ( $works_query->have_posts() ) : ?>
		<div class="works-grid">
			<?php while ( $works_query->have_posts() ) : $works_query->the_post(); ?>
				<a class="card work-card" href="<?php the_permalink(); ?>" data-reveal>
					<div class="thumb">
						<?php if ( has_post_thumbnail() ) : ?>
							<?php the_post_thumbnail( 'medium_large' ); ?>
						<?php else : ?>
							<span class="mono">NO IMAGE</span>
						<?php endif; ?>
					</div>
					<div class="body">
						<?php off_product_works_status_badge( get_the_ID() ); ?>
						<h3><?php the_title(); ?></h3>
						<p><?php echo esc_html( wp_trim_words( get_the_excerpt(), 28 ) ); ?></p>
					</div>
				</a>
			<?php endwhile; wp_reset_postdata(); ?>
		</div>
	<?php else : ?>
		<div class="works-grid">
			<?php
			$placeholders = array(
				'体重・食事管理アプリ',
				'資格試験解答記録アプリ',
				'ファッションコーディネート提案アプリ',
			);
			foreach ( $placeholders as $name ) :
				?>
				<div class="work-slot" data-reveal>
					<div class="plus">＋</div>
					<span class="name"><?php echo esc_html( $name ); ?></span>
					<span class="label mono">PROJECT — 近日公開</span>
				</div>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
</section>

<section id="process" class="wrap">
	<div class="section-head" data-reveal>
		<div>
			<div class="kicker">04 / PROCESS</div>
			<h2>開発の流れ</h2>
		</div>
	</div>
	<div class="process-grid">
		<div class="card process-card" data-reveal><span class="num mono">01</span><h4>ヒアリング</h4><p>目的・課題・利用シーンを丁寧にお聞きします。</p></div>
		<div class="card process-card" data-reveal><span class="num mono">02</span><h4>企画・設計</h4><p>機能要件とUI/UXを設計し、仕様として固めます。</p></div>
		<div class="card process-card" data-reveal><span class="num mono">03</span><h4>開発</h4><p>設計に基づき実装。進捗は都度共有します。</p></div>
		<div class="card process-card" data-reveal><span class="num mono">04</span><h4>リリース・運用</h4><p>公開後も改善・保守を継続してサポートします。</p></div>
	</div>
</section>

<section id="company" class="wrap">
	<div class="section-head" data-reveal>
		<div>
			<div class="kicker">05 / COMPANY</div>
			<h2>会社概要</h2>
		</div>
	</div>
	<div class="card company-card" data-reveal>
		<table class="company-table">
			<?php
			$rows = array(
				'会社名' => get_theme_mod( 'company_name', '株式会社OFF PRODUCT' ),
				'事業内容' => get_theme_mod( 'company_business', 'アプリ開発（今後、他事業への展開を予定）' ),
				'設立'   => get_theme_mod( 'company_founded', '' ),
				'所在地' => get_theme_mod( 'company_address', '' ),
				'代表者' => get_theme_mod( 'company_ceo', '' ),
			);
			foreach ( $rows as $label => $value ) :
				?>
				<tr>
					<td class="mono"><?php echo esc_html( $label ); ?></td>
					<td class="<?php echo $value ? '' : 'placeholder'; ?>"><?php echo esc_html( $value ); ?></td>
				</tr>
			<?php endforeach; ?>
		</table>
	</div>
</section>

<?php
get_footer();
