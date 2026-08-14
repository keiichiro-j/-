<?php
/**
 * Archive view listing all "works" (実績) entries.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<section class="wrap" style="padding:80px 0;">
	<div class="section-head">
		<div>
			<div class="kicker">WORKS</div>
			<h2>開発実績・プロダクト</h2>
		</div>
	</div>

	<?php if ( have_posts() ) : ?>
		<div class="works-grid">
			<?php while ( have_posts() ) : the_post(); ?>
				<a class="card work-card" href="<?php the_permalink(); ?>">
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
			<?php endwhile; ?>
		</div>
		<?php the_posts_pagination(); ?>
	<?php else : ?>
		<p>まだ実績が登録されていません。</p>
	<?php endif; ?>
</section>
<?php
get_footer();
