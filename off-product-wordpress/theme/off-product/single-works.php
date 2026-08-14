<?php
/**
 * Single view for a "works" (実績) entry.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<section class="wrap" style="padding:80px 0;max-width:820px;">
	<?php while ( have_posts() ) : the_post(); ?>
		<article <?php post_class(); ?>>
			<?php off_product_works_status_badge( get_the_ID() ); ?>
			<h1 style="font-size:32px;margin:12px 0 28px;"><?php the_title(); ?></h1>
			<?php if ( has_post_thumbnail() ) : ?>
				<div class="card" style="overflow:hidden;margin-bottom:32px;">
					<?php the_post_thumbnail( 'large', array( 'style' => 'width:100%;height:auto;display:block;' ) ); ?>
				</div>
			<?php endif; ?>
			<div class="entry-content">
				<?php the_content(); ?>
			</div>
		</article>
		<p style="margin-top:40px;">
			<a class="cta-btn ghost" href="<?php echo esc_url( home_url( '/#works' ) ); ?>">← 実績一覧に戻る</a>
		</p>
	<?php endwhile; ?>
</section>
<?php
get_footer();
